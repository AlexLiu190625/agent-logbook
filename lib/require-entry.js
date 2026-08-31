'use strict';

// The delivery gate behind `logbook check --require-entry-since <ref>`.
//
// The five rules in lib/rules.js all answer the same question: is what was
// written written correctly? None of them can answer the other question, which
// is whether anything was written at all — an empty journal passes every rule.
// This gate answers that one, and only when a caller asks for it by naming the
// revision the delivery started from.

const path = require('node:path');
const git = require('./git');
const parse = require('./parse');
const ws = require('./workspace');

const PLACEHOLDER_SPAN = /<[^>]*>/g;

function entryKey(entry) {
  return `${entry.date}|${entry.topic.toLowerCase()}`;
}

// A bullet still holding nothing but template placeholders is not content. The
// source tag is stripped first so that `... (src: <file, command, or URL>)`
// does not count as writing by virtue of the two words "src" and "file".
function isFilledItem(item) {
  const withoutSource = item.text.replace(/\(src:[^)]*\)/g, ' ');
  const withoutPlaceholders = withoutSource.replace(PLACEHOLDER_SPAN, ' ');
  return /[A-Za-z0-9]/.test(withoutPlaceholders);
}

// An entry counts as a record of work when it is pinned to a real-looking
// commit and says at least one thing under Decision: or Facts:. Whether that
// commit exists, and whether those facts carry sources, is R1's and R4's job;
// this gate only refuses to accept an untouched `logbook add` skeleton as
// evidence that the delivery was written up.
function isComplete(entry) {
  const pinned = entry.baselines.some((token) => !token.placeholder && token.valid);
  if (!pinned) return false;
  for (const name of ['decision', 'facts']) {
    const field = entry.fields[name];
    if (field && field.items.some(isFilledItem)) return true;
  }
  return false;
}

function completeKeysAtRef(ctx, ref) {
  const journalDir = git.repoRelative(ctx.git.root, path.join(ctx.root, ws.JOURNAL_DIR));
  const keys = new Set();
  for (const repoRelPath of git.filesAtRef(ctx.git.root, ref, journalDir)) {
    if (!repoRelPath.endsWith('.md')) continue;
    const bytes = git.fileAtRef(ctx.git.root, ref, repoRelPath);
    if (bytes === null) continue;
    for (const entry of parse.parseEntries(bytes.toString('utf8')).entries) {
      if (isComplete(entry)) keys.add(entryKey(entry));
    }
  }
  return keys;
}

function userError(message) {
  const err = new Error(message);
  err.userFacing = true;
  return err;
}

// Returns { ok, ref, commit, short, added, skeletons } or throws a user-facing
// error when the revision cannot be used.
function requireEntrySince(ctx, ref) {
  if (!ctx.git.inRepo) {
    throw userError(
      '--require-entry-since needs a git repository, and this directory is not inside one.'
    );
  }
  if (!ctx.git.hasCommits) {
    throw userError(
      `--require-entry-since ${ref} cannot run here: this repository has no commits yet, so there is no revision to compare against.`
    );
  }
  const commit = git.resolveCommit(ctx.git.root, ref);
  if (!commit) {
    throw userError(
      `--require-entry-since ${ref}: "${ref}" does not name a commit in this repository.\n` +
        'Check the spelling, or run `git fetch` if it is a remote branch this clone has not seen. ' +
        'When there is genuinely nothing to compare against — a first push of a new branch — leave the option off rather than passing a revision that does not exist.'
    );
  }

  const before = completeKeysAtRef(ctx, commit);
  const added = [];
  const skeletons = [];
  for (const journal of ctx.journals) {
    for (const entry of journal.entries) {
      const record = { file: journal.rel, line: entry.line, heading: entry.heading };
      if (!isComplete(entry)) {
        if (!before.has(entryKey(entry))) skeletons.push(record);
        continue;
      }
      if (before.has(entryKey(entry))) continue;
      added.push(record);
    }
  }
  return {
    ok: added.length > 0,
    ref,
    commit,
    short: git.shortHash(ctx.git.root, commit),
    added,
    skeletons,
  };
}

// How the revision is named back to the reader. A revision the caller wrote as
// a raw hash is shown once, shortened; a name like `origin/main` is shown with
// the commit it resolved to, because that is the fact the reader cannot see.
function describe(result) {
  if (result.commit.startsWith(result.ref)) return result.short;
  return `${result.ref} (${result.short})`;
}

// The failure text. Kept here rather than in the formatter because the whole
// point of the gate is the instruction it gives, not the fact that it failed.
function failureLines(result) {
  const where = describe(result);
  const lines = [];
  if (result.skeletons.length) {
    lines.push(
      `This delivery is not recorded in the logbook: the ${result.skeletons.length === 1 ? 'entry' : 'entries'} added since ${where} ${result.skeletons.length === 1 ? 'is' : 'are'} still an unfilled template.`
    );
    for (const s of result.skeletons) {
      lines.push(`    ${s.file}:${s.line}: "${s.heading}" has no baseline or nothing under Decision: or Facts:.`);
    }
    lines.push('    Fill the placeholders in, or delete the skeleton and write the entry properly.');
  } else {
    lines.push(`This delivery is not recorded in the logbook: no entry has been added since ${where}.`);
    lines.push('    Write one before shipping: `logbook add "what you just did"`, then fill in Baseline:,');
    lines.push('    Decision: and Facts: and commit the journal file alongside the change.');
  }
  lines.push('    If this change genuinely produced no decision and no fact worth citing, skip the gate');
  lines.push('    deliberately (git push --no-verify) rather than writing an empty entry to get past it.');
  return lines;
}

function successNote(result) {
  const n = result.added.length;
  return `require-entry-since ${describe(result)}: ${n} new entr${n === 1 ? 'y' : 'ies'} in the journal.`;
}

module.exports = {
  requireEntrySince,
  failureLines,
  successNote,
  describe,
  isComplete,
  isFilledItem,
};
