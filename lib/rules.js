'use strict';

const fs = require('node:fs');
const path = require('node:path');
const git = require('./git');
const parse = require('./parse');
const ws = require('./workspace');

const CORRECTS_TARGET = /^(\d{4}-\d{2}-\d{2})(?:\s+\d{2}:\d{2})?\s*(?:[-–—:]+)\s*(.*\S)\s*$/;

function violation(rule, file, line, message, hint) {
  return { rule, file, line, message, hint };
}

function isExternalTarget(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//');
}

// Strips the anchor and query so that `docs/FORMAT.md#syntax` resolves to a file.
function targetToPath(target) {
  const clean = target.split('#')[0].split('?')[0];
  if (!clean) return null;
  try {
    return decodeURIComponent(clean);
  } catch {
    return clean;
  }
}

function normalizePath(p) {
  return p.replace(/^\.\//, '').replace(/\/+$/, '');
}

// R1 - every entry pins itself to a commit that really exists.
function ruleBaselineReal(ctx) {
  const violations = [];
  const notes = [];
  let externalSkipped = 0;
  for (const journal of ctx.journals) {
    for (const entry of journal.entries) {
      if (!entry.baselines.length) {
        violations.push(
          violation(
            'R1',
            journal.rel,
            entry.line,
            `Entry "${entry.heading}" declares no baseline.`,
            'Add a line `Baseline: <commit hash>` so the conclusion is pinned to a code version.'
          )
        );
        continue;
      }
      for (const token of entry.baselines) {
        if (token.placeholder) {
          violations.push(
            violation(
              'R1',
              journal.rel,
              token.line,
              `Baseline is still the template placeholder: ${token.raw}`,
              'Replace it with the output of `git rev-parse --short HEAD`.'
            )
          );
          continue;
        }
        if (!token.valid) {
          violations.push(
            violation(
              'R1',
              journal.rel,
              token.line,
              `Baseline "${token.raw}" is not a commit hash.`,
              'Use 7 to 40 hexadecimal characters, optionally prefixed with `repo-name@`.'
            )
          );
          continue;
        }
        if (token.repo) {
          externalSkipped += 1;
          notes.push(
            `${journal.rel}:${token.line}: baseline ${token.raw} lives in another repository, existence not checked.`
          );
          continue;
        }
        if (!ctx.git.inRepo || !ctx.git.hasCommits) continue;
        if (!git.commitExists(ctx.root, token.hash)) {
          violations.push(
            violation(
              'R1',
              journal.rel,
              token.line,
              `Baseline commit ${token.hash} does not exist in this repository.`,
              'Check the hash, or mark it as another repository with `repo-name@' + token.hash + '`.'
            )
          );
        }
      }
    }
  }
  const skipped = [];
  if (!ctx.git.inRepo) {
    skipped.push('R1 skipped: this directory is not inside a git repository, so baselines cannot be verified.');
  } else if (!ctx.git.hasCommits) {
    skipped.push('R1 skipped: the repository has no commits yet, so baselines cannot be verified.');
  }
  return { violations, skipped, notes, externalSkipped };
}

// R2 - links to files in this repository, and correction targets, must resolve.
function ruleReferencesResolve(ctx) {
  const violations = [];
  const files = [{ rel: ws.LEDGER_FILE, abs: ctx.ledgerPath, links: ctx.ledgerLinks }].concat(
    ctx.journals.map((j) => ({ rel: j.rel, abs: j.abs, links: j.links }))
  );
  for (const file of files) {
    for (const link of file.links) {
      if (isExternalTarget(link.target)) continue;
      if (link.target.startsWith('#')) continue;
      const rel = targetToPath(link.target);
      if (!rel) continue;
      const base = link.target.startsWith('/')
        ? path.join(ctx.root, rel)
        : path.resolve(path.dirname(file.abs), rel);
      if (fs.existsSync(base)) continue;
      // Relative links resolve against the file that contains them, the way
      // GitHub renders them. A path that only resolves from the ledger root is
      // the common mistake, so name the fix instead of just saying "missing".
      const fromRoot = path.resolve(ctx.root, rel);
      if (fromRoot !== base && fs.existsSync(fromRoot)) {
        const suggestion = path
          .relative(path.dirname(file.abs), fromRoot)
          .split(path.sep)
          .join('/');
        violations.push(
          violation(
            'R2',
            file.rel,
            link.line,
            `Link points at ${link.target}, which does not exist next to ${file.rel}.`,
            `Links resolve relative to the file holding them, so write ${suggestion} here.`
          )
        );
        continue;
      }
      violations.push(
        violation(
          'R2',
          file.rel,
          link.line,
          `Link points at ${link.target}, which does not exist.`,
          'Fix the path, or remove the link if the document is gone.'
        )
      );
    }
  }

  const index = new Map();
  for (const journal of ctx.journals) {
    for (const entry of journal.entries) {
      index.set(`${entry.date}|${entry.topic.toLowerCase()}`, entry);
    }
  }
  for (const journal of ctx.journals) {
    for (const entry of journal.entries) {
      const field = entry.fields.corrects;
      if (!field) continue;
      const targets = field.items.length
        ? field.items.map((i) => ({ text: i.text, line: i.line }))
        : [{ text: field.inline, line: field.line }];
      for (const target of targets) {
        const text = target.text.trim();
        if (!text) continue;
        const m = CORRECTS_TARGET.exec(text.replace(/^["'`]|["'`]$/g, ''));
        if (!m) {
          violations.push(
            violation(
              'R2',
              journal.rel,
              target.line,
              `Corrects: "${text}" does not name an entry.`,
              'Write the entry exactly as its heading reads, for example `2026-08-31 — Chose SQLite`.'
            )
          );
          continue;
        }
        if (!index.has(`${m[1]}|${m[2].toLowerCase()}`)) {
          violations.push(
            violation(
              'R2',
              journal.rel,
              target.line,
              `Corrects: no entry titled "${m[1]} — ${m[2]}" exists in the journal.`,
              'A correction must point at an entry that is really there; check the date and the title.'
            )
          );
        }
      }
    }
  }
  return { violations, skipped: [], notes: [] };
}

// R3 - documents living in the registered directories must appear in the index.
function ruleDocumentsRegistered(ctx) {
  const violations = [];
  const notes = [];
  const registered = new Set();
  for (const row of ctx.indexTable.rows) {
    for (const cell of row.cells) {
      for (const link of parse.parseLinks(cell)) {
        const rel = targetToPath(link.target);
        if (rel && !isExternalTarget(link.target)) registered.add(normalizePath(rel));
      }
      const bare = cell.replace(/`/g, '').trim();
      if (bare && /^[\w./-]+\.[A-Za-z0-9]+$/.test(bare)) registered.add(normalizePath(bare));
    }
  }
  let checkedDirs = 0;
  for (const dir of ctx.config.registeredDirs) {
    const abs = path.resolve(ctx.root, dir);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) continue;
    checkedDirs += 1;
    for (const file of ws.listFilesRecursive(abs)) {
      const rel = normalizePath(ws.relFromRoot(ctx.root, file));
      if (registered.has(rel)) continue;
      violations.push(
        violation(
          'R3',
          ws.LEDGER_FILE,
          ctx.indexTable.found ? ctx.indexTable.headingLine : 1,
          `${rel} is not registered in the document index.`,
          'Add a row for it under "Document index" with a one-line conclusion and a status.'
        )
      );
    }
  }
  if (checkedDirs === 0) {
    notes.push(
      `R3: none of the registered directories exist (${ctx.config.registeredDirs.join(', ') || 'none configured'}), nothing to check.`
    );
  } else if (!ctx.indexTable.found) {
    notes.push('R3: LEDGER.md has no "Document index" heading, so no document counts as registered.');
  }
  return { violations, skipped: [], notes };
}

// R4 - every fact carries a source; anything unsourced belongs under Assumptions.
function ruleFactsHaveSources(ctx) {
  const violations = [];
  for (const journal of ctx.journals) {
    for (const entry of journal.entries) {
      const field = entry.fields.facts;
      if (!field) continue;
      for (const item of field.items) {
        const source = parse.sourceOf(item);
        const shown = item.text.length > 70 ? `${item.text.slice(0, 67)}...` : item.text;
        if (source && /^<.*>$/.test(source)) {
          violations.push(
            violation(
              'R4',
              journal.rel,
              item.line,
              `Fact source is still the template placeholder: (src: ${source})`,
              'Replace it with the file, command, or URL the fact actually came from.'
            )
          );
          continue;
        }
        if (source) continue;
        violations.push(
          violation(
            'R4',
            journal.rel,
            item.line,
            `Fact has no source: "${shown}"`,
            'Append a source like (src: lib/parse.js:42), (src: $ npm test), or (src: https://...). If you cannot cite one, move the line under Assumptions:.'
          )
        );
      }
    }
  }
  return { violations, skipped: [], notes: [] };
}

// R5 - journal history is append-only: what is committed must still be a byte
// prefix of the working copy.
function ruleAppendOnly(ctx) {
  const violations = [];
  const skipped = [];
  if (!ctx.git.inRepo) {
    skipped.push('R5 skipped: this directory is not inside a git repository, so history cannot be compared.');
    return { violations, skipped, notes: [] };
  }
  if (!ctx.git.hasCommits) {
    skipped.push('R5 skipped: the repository has no commits yet, so there is no history to compare against.');
    return { violations, skipped, notes: [] };
  }
  for (const journal of ctx.journals) {
    const repoRel = git.repoRelative(ctx.git.root, journal.abs);
    const committed = git.fileAtHead(ctx.git.root, repoRel);
    if (committed === null) continue;
    const current = fs.readFileSync(journal.abs);
    const isPrefix =
      current.length >= committed.length &&
      current.subarray(0, committed.length).equals(committed);
    if (isPrefix) continue;
    let line = 1;
    const limit = Math.min(committed.length, current.length);
    for (let i = 0; i < limit && committed[i] === current[i]; i++) {
      if (committed[i] === 0x0a) line += 1;
    }
    violations.push(
      violation(
        'R5',
        journal.rel,
        line,
        'Committed journal history was rewritten; the file no longer starts with what was committed.',
        'Restore the old text and append a new entry with a `Corrects:` field instead of editing the past.'
      )
    );
  }
  return { violations, skipped, notes: [] };
}

const RULES = [
  { id: 'R1', title: 'baselines are real commits', run: ruleBaselineReal },
  { id: 'R2', title: 'references resolve', run: ruleReferencesResolve },
  { id: 'R3', title: 'documents are registered', run: ruleDocumentsRegistered },
  { id: 'R4', title: 'facts carry sources', run: ruleFactsHaveSources },
  { id: 'R5', title: 'journal history is append-only', run: ruleAppendOnly },
];

module.exports = { RULES };
