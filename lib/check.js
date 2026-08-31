'use strict';

const fs = require('node:fs');
const path = require('node:path');
const parse = require('./parse');
const ws = require('./workspace');
const { RULES } = require('./rules');
const requireEntry = require('./require-entry');

function buildContext(root) {
  const logbookPath = path.join(root, ws.LOGBOOK_FILE);
  const logbookText = fs.readFileSync(logbookPath, 'utf8');
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
    logbookPath,
    logbookText,
    logbookLinks: parse.parseLinks(logbookText),
    indexTable: parse.parseIndexTable(logbookText),
    journals,
    git: ws.gitContext(root),
  };
}

function check(root, options = {}) {
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
          message: `"${unknown.name}:" is not a logbook field and is ignored; the fields are ${parse.FIELDS.join(', ')}.`,
        });
      }
    }
  }
  violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule));

  // The delivery gate is deliberately outside the five rules: those judge what
  // was written, this one asks whether anything was written, and it only runs
  // when the caller names the revision the delivery started from.
  const delivery = options.requireEntrySince
    ? requireEntry.requireEntrySince(ctx, options.requireEntrySince)
    : null;

  return { ctx, violations, warnings, skipped, notes, delivery };
}

function failed(result) {
  return result.violations.length > 0 || Boolean(result.delivery && !result.delivery.ok);
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
  const deliveryFailed = Boolean(result.delivery && !result.delivery.ok);
  if (deliveryFailed) {
    out.push(...requireEntry.failureLines(result.delivery));
    out.push('');
  }
  for (const w of result.warnings) out.push(`${w.file}:${w.line}: warning: ${w.message}`);
  for (const n of result.notes) out.push(`note: ${n}`);
  for (const s of result.skipped) out.push(`note: ${s}`);
  if (result.delivery && result.delivery.ok) out.push(`note: ${requireEntry.successNote(result.delivery)}`);
  if (result.warnings.length || result.notes.length || result.skipped.length || (result.delivery && result.delivery.ok)) {
    out.push('');
  }

  const entries = entryCount(result.ctx);
  const files = result.ctx.journals.length;
  if (!failed(result)) {
    out.push(`logbook check passed: ${entries} entr${entries === 1 ? 'y' : 'ies'} in ${files} journal file${files === 1 ? '' : 's'}.`);
    return out.join('\n');
  }

  const parts = [];
  if (result.violations.length) {
    const byRule = new Map();
    for (const v of result.violations) byRule.set(v.rule, (byRule.get(v.rule) || 0) + 1);
    const breakdown = [...byRule.entries()].sort().map(([r, n]) => `${r}:${n}`).join(' ');
    parts.push(
      `${result.violations.length} problem${result.violations.length === 1 ? '' : 's'} (${breakdown}) across ${entries} entr${entries === 1 ? 'y' : 'ies'}`
    );
  }
  if (deliveryFailed) {
    parts.push(`this delivery has no new logbook entry since ${requireEntry.describe(result.delivery)}`);
  }
  out.push(`logbook check failed: ${parts.join(', and ')}.`);
  return out.join('\n');
}

module.exports = { check, format, failed, buildContext };
