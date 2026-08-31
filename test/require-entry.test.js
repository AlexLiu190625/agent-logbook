'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers');

// Builds a repository whose journal already holds one finished entry, committed.
// That commit is the "before" state every delivery is measured against.
function repoWithCommittedLogbook() {
  const dir = h.makeRepo();
  const hash = h.headHash(dir);
  h.setupLogbook(dir, { hash });
  h.git(dir, ['add', '-A']);
  h.git(dir, ['commit', '-q', '-m', 'logbook']);
  return { dir, base: h.git(dir, ['rev-parse', 'HEAD']).trim() };
}

function newEntry(dir, { date = '2026-09-01', topic = 'Added the retry budget' } = {}) {
  const hash = h.headHash(dir);
  return `\n## ${date} — ${topic}\n
Baseline: ${hash}

Decision:
- Retries stop after three attempts.

Facts:
- The caller already handles a failed call (src: app.js)
`;
}

function appendToJournal(dir, text, date = '2026-08-31') {
  fs.appendFileSync(path.join(dir, 'journal', `${date}.md`), text);
}

test('--require-entry-since passes when the journal gained an entry', () => {
  const { dir, base } = repoWithCommittedLogbook();
  appendToJournal(dir, newEntry(dir));
  const r = h.run(dir, ['check', '--require-entry-since', base]);
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.output, /require-entry-since .*: 1 new entry in the journal/);
  assert.match(r.output, /logbook check passed/);
});

test('--require-entry-since fails when nothing was written for this delivery', () => {
  const { dir, base } = repoWithCommittedLogbook();
  h.write(dir, 'app.js', "console.log('a change nobody wrote down');\n");
  const r = h.run(dir, ['check', '--require-entry-since', base]);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /This delivery is not recorded in the logbook: no entry has been added since/);
  assert.match(r.output, /logbook add/);
  assert.match(r.output, /logbook check failed: this delivery has no new logbook entry since/);
});

test('--require-entry-since counts an entry committed after the reference', () => {
  const { dir, base } = repoWithCommittedLogbook();
  appendToJournal(dir, newEntry(dir));
  h.git(dir, ['add', '-A']);
  h.git(dir, ['commit', '-q', '-m', 'feature plus its entry']);

  const since = h.run(dir, ['check', '--require-entry-since', base]);
  assert.strictEqual(since.status, 0, since.output);

  // Measured from HEAD instead, the same journal has gained nothing, which is
  // the proof that the gate really compares against the revision it is given.
  const fromHead = h.run(dir, ['check', '--require-entry-since', 'HEAD']);
  assert.strictEqual(fromHead.status, 1, fromHead.output);
});

test('--require-entry-since refuses an untouched template as a record', () => {
  const { dir, base } = repoWithCommittedLogbook();
  const hash = h.headHash(dir);
  appendToJournal(
    dir,
    `\n## 2026-09-01 — Something I have not written up yet\n
Baseline: ${hash}

Decision:
- <what was decided; delete this field if nothing was decided>
`
  );
  const r = h.run(dir, ['check', '--require-entry-since', base]);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /still an unfilled template/);
  assert.match(r.output, /Something I have not written up yet/);
});

test('--require-entry-since accepts an entry that is not committed yet', () => {
  const { dir, base } = repoWithCommittedLogbook();
  appendToJournal(dir, newEntry(dir));
  const r = h.run(dir, ['check', '--require-entry-since', base]);
  assert.strictEqual(r.status, 0, r.output);
});

test('--require-entry-since rejects a revision this repository does not have', () => {
  const { dir } = repoWithCommittedLogbook();
  const r = h.run(dir, ['check', '--require-entry-since', 'origin/main']);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /"origin\/main" does not name a commit in this repository/);
  assert.match(r.output, /git fetch/);
  assert.doesNotMatch(r.output, /not recorded in the logbook/);
});

test('--require-entry-since is a usage error without a revision', () => {
  const { dir } = repoWithCommittedLogbook();
  const r = h.run(dir, ['check', '--require-entry-since']);
  assert.strictEqual(r.status, 2, r.output);
  assert.match(r.output, /needs a git revision/);
});

test('--require-entry-since=<ref> is accepted in the joined form', () => {
  const { dir, base } = repoWithCommittedLogbook();
  appendToJournal(dir, newEntry(dir));
  const r = h.run(dir, ['check', `--require-entry-since=${base}`]);
  assert.strictEqual(r.status, 0, r.output);
});

test('check rejects an unknown option instead of ignoring it', () => {
  const { dir } = repoWithCommittedLogbook();
  const r = h.run(dir, ['check', '--require-entries']);
  assert.strictEqual(r.status, 2, r.output);
  assert.match(r.output, /Unknown option/);
});

test('--require-entry-since says so when there is no git repository', () => {
  const dir = h.makeRepo({ initGit: false });
  h.setupLogbook(dir, { hash: '0123456789abcdef0123456789abcdef01234567' });
  const r = h.run(dir, ['check', '--require-entry-since', 'HEAD']);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /needs a git repository/);
});

// The sample pre-push hook.

test('pre-push blocks a push that carries no new entry', () => {
  const { dir, base } = repoWithCommittedLogbook();
  h.installBinShim(dir);
  h.installHook(dir, 'pre-push');
  h.write(dir, 'app.js', "console.log('undocumented');\n");
  h.git(dir, ['add', '-A']);
  h.git(dir, ['commit', '-q', '-m', 'a change nobody wrote down']);

  const local = h.git(dir, ['rev-parse', 'HEAD']).trim();
  const r = h.runHook(dir, 'pre-push', `refs/heads/main ${local} refs/heads/main ${base}\n`);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /not recorded in the logbook/);
  assert.match(r.output, /Push stopped/);
});

test('pre-push lets a push through when the delivery is written up', () => {
  const { dir, base } = repoWithCommittedLogbook();
  h.installBinShim(dir);
  h.installHook(dir, 'pre-push');
  appendToJournal(dir, newEntry(dir));
  h.git(dir, ['add', '-A']);
  h.git(dir, ['commit', '-q', '-m', 'feature plus its entry']);

  const local = h.git(dir, ['rev-parse', 'HEAD']).trim();
  const r = h.runHook(dir, 'pre-push', `refs/heads/main ${local} refs/heads/main ${base}\n`);
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.output, /logbook check passed/);
});

test('pre-push lets a first push through and says why the gate was skipped', () => {
  const { dir } = repoWithCommittedLogbook();
  h.installBinShim(dir);
  h.installHook(dir, 'pre-push');

  const local = h.git(dir, ['rev-parse', 'HEAD']).trim();
  const r = h.runHook(dir, 'pre-push', `refs/heads/main ${local} refs/heads/main ${h.ZERO_SHA}\n`);
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.output, /does not exist on the remote yet/);
  assert.match(r.output, /skipped for this first push/);
  assert.match(r.output, /logbook check passed/);
});

test('pre-push skips the gate when the remote commit is not in this clone', () => {
  const { dir } = repoWithCommittedLogbook();
  h.installBinShim(dir);
  h.installHook(dir, 'pre-push');

  const local = h.git(dir, ['rev-parse', 'HEAD']).trim();
  const absent = '0123456789abcdef0123456789abcdef01234567';
  const r = h.runHook(dir, 'pre-push', `refs/heads/main ${local} refs/heads/main ${absent}\n`);
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.output, /which is not in this clone/);
  assert.match(r.output, /git fetch/);
});

test('pre-push ignores a branch deletion', () => {
  const { dir, base } = repoWithCommittedLogbook();
  h.installBinShim(dir);
  h.installHook(dir, 'pre-push');
  const r = h.runHook(dir, 'pre-push', `(delete) ${h.ZERO_SHA} refs/heads/gone ${base}\n`);
  assert.strictEqual(r.status, 0, r.output);
  assert.doesNotMatch(r.output, /not recorded in the logbook/);
});
