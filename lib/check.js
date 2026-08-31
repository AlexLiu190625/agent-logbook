'use strict';

const fs = require('node:fs');
const path = require('node:path');
const parse = require('./parse');
const ws = require('./workspace');
const { RULES } = require('./rules');

function buildContext(root) {
  const ledgerPath = path.join(root, ws.LEDGER_FILE);
  const ledgerText = fs.readFileSync(ledgerPath, 'utf8');
  const journals = ws.journalFiles(root).map((abs) => {
    const text = fs.readFileSync(abs, 'utf8');
    const parsed = parse.parseEntries(text);
    return {
      abs,
      rel: ws.relFromRoot(root, abs),
      text,
      entries: parsed.entries,
      strayHeadings: parsed.strayHeadings,
      links: parse.parseLinks(text),
    };
  });
  return {
    root,
    config: ws.loadConfig(root),
    ledgerPath,
    ledgerText,
    ledgerLinks: parse.parseLinks(ledgerText),
    indexTable: parse.parseIndexTable(ledgerText),
    journals,
    git: ws.gitContext(root),
  };
}

function check(root) {
  const ctx = buildContext(root);
  const violations = [];
  const skipped = [];
  const notes = [];
  for (const rule of RULES) {
    const result = rule.run(ctx);
    violations.push(...result.violations);
    skipped.push(...(result.skipped || []));
    notes.push(...(result.notes || []));
  }
  const warnings = [];
  for (const journal of ctx.journals) {
    for (const stray of journal.strayHeadings) {
      warnings.push({
        file: journal.rel,
        line: stray.line,
        message: `Heading "${stray.text}" is not an entry and is ignored; an entry heading starts with a date, as in "2026-08-31 — Topic".`,
      });
    }
    for (const entry of journal.entries) {
      for (const unknown of entry.unknownFields) {
        warnings.push({
          file: journal.rel,
          line: unknown.line,
          message: `"${unknown.name}:" is not a ledger field and is ignored; the fields are ${parse.FIELDS.join(', ')}.`,
        });
      }
    }
  }
  violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule));
  return { ctx, violations, warnings, skipped, notes };
}

function entryCount(ctx) {
  return ctx.journals.reduce((n, j) => n + j.entries.length, 0);
}

function format(result) {
  const out = [];
  for (const v of result.violations) {
    out.push(`${v.file}:${v.line}: ${v.rule} ${v.message}`);
    out.push(`    ${v.hint}`);
  }
  if (result.violations.length) out.push('');
  for (const w of result.warnings) out.push(`${w.file}:${w.line}: warning: ${w.message}`);
  for (const n of result.notes) out.push(`note: ${n}`);
  for (const s of result.skipped) out.push(`note: ${s}`);
  if (result.warnings.length || result.notes.length || result.skipped.length) out.push('');

  const entries = entryCount(result.ctx);
  const files = result.ctx.journals.length;
  if (result.violations.length === 0) {
    out.push(`ledger check passed: ${entries} entr${entries === 1 ? 'y' : 'ies'} in ${files} journal file${files === 1 ? '' : 's'}.`);
  } else {
    const byRule = new Map();
    for (const v of result.violations) byRule.set(v.rule, (byRule.get(v.rule) || 0) + 1);
    const breakdown = [...byRule.entries()].sort().map(([r, n]) => `${r}:${n}`).join(' ');
    out.push(
      `ledger check failed: ${result.violations.length} problem${result.violations.length === 1 ? '' : 's'} (${breakdown}) across ${entries} entr${entries === 1 ? 'y' : 'ies'}.`
    );
  }
  return out.join('\n');
}

module.exports = { check, format, buildContext };
