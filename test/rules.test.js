'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers');

const REVIEW_ROW =
  '| [reviews/storage.md](reviews/storage.md) | SQLite is fast enough | current |';

// R1 - baselines are real commits.

test('R1 passes when the baseline is a commit in this repository', () => {
  const dir = h.makeRepo();
  h.setupLogbook(dir, { hash: h.headHash(dir) });
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.output, /passed/);
});

test('R1 fails when the baseline commit does not exist', () => {
  const dir = h.makeRepo();
  h.setupLogbook(dir, { hash: '0123456789abcdef0123456789abcdef01234567' });
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /R1 Baseline commit 0123456789abcdef.* does not exist in this repository/);
  assert.match(r.output, /journal\/2026-08-31\.md:5/);
});

test('R1 fails when an entry declares no baseline at all', () => {
  const dir = h.makeRepo();
  h.setupLogbook(dir, {
    entry: `## 2026-08-31 — No baseline here

Facts:
- Something true (src: app.js)
`,
  });
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /declares no baseline/);
});

test('R1 skips a baseline that names another repository', () => {
  const dir = h.makeRepo();
  h.setupLogbook(dir, { hash: 'other-repo@0123456789abcdef0123456789abcdef01234567' });
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.output, /lives in another repository, existence not checked/);
});

test('R1 and R5 report themselves skipped outside a git repository', () => {
  const dir = h.makeRepo({ initGit: false });
  h.setupLogbook(dir, { hash: '0123456789abcdef0123456789abcdef01234567' });
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.output, /R1 skipped: this directory is not inside a git repository/);
  assert.match(r.output, /R5 skipped: this directory is not inside a git repository/);
});

// R2 - references resolve.

test('R2 passes when a link points at a file that exists', () => {
  const dir = h.makeRepo();
  h.write(dir, 'reviews/storage.md', '# Storage options\n');
  h.setupLogbook(dir, { hash: h.headHash(dir), indexRows: [REVIEW_ROW] });
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 0, r.output);
});

test('R2 fails on a link to a file that does not exist', () => {
  const dir = h.makeRepo();
  h.setupLogbook(dir, {
    hash: h.headHash(dir),
    indexRows: ['| [reviews/gone.md](reviews/gone.md) | vanished | stale |'],
  });
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /R2 Link points at reviews\/gone\.md, which does not exist/);
  assert.match(r.output, /^LOGBOOK\.md:7/m);
});

test('R2 explains that links resolve next to the file that holds them', () => {
  const dir = h.makeRepo();
  h.write(dir, 'reviews/storage.md', '# Storage options\n');
  h.setupLogbook(dir, {
    hash: h.headHash(dir),
    indexRows: [REVIEW_ROW],
    entry: `## 2026-08-31 — Chose SQLite

Baseline: ${h.headHash(dir)}

Facts:
- Written up in [the review](reviews/storage.md) (src: reviews/storage.md)
`,
  });
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /so write \.\.\/reviews\/storage\.md here/);
});

test('R2 leaves external links alone', () => {
  const dir = h.makeRepo();
  const hash = h.headHash(dir);
  h.setupLogbook(dir, {
    hash,
    entry: `## 2026-08-31 — Read the upstream issue

Baseline: ${hash}

Facts:
- Upstream says the flag is deprecated, see [issue 12](https://example.com/issues/12) (src: https://example.com/issues/12)
`,
  });
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 0, r.output);
});

test('R2 passes when a correction names an entry that exists', () => {
  const dir = h.makeRepo();
  const hash = h.headHash(dir);
  h.setupLogbook(dir, { hash });
  h.write(
    dir,
    'journal/2026-09-02.md',
    `# Journal 2026-09-02

## 2026-09-02 — SQLite is not fast enough after all

Corrects: 2026-08-31 — Chose SQLite for the cache

Baseline: ${hash}

Facts:
- The measured write rate is 4000 rows per second (src: $ node bench.js)
`
  );
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 0, r.output);
});

test('R2 fails when a correction names an entry that does not exist', () => {
  const dir = h.makeRepo();
  const hash = h.headHash(dir);
  h.setupLogbook(dir, { hash });
  h.write(
    dir,
    'journal/2026-09-02.md',
    `# Journal 2026-09-02

## 2026-09-02 — Correcting something imaginary

Corrects: 2026-08-30 — An entry nobody ever wrote

Baseline: ${hash}

Facts:
- Something true (src: app.js)
`
  );
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /R2 Corrects: no entry titled "2026-08-30 — An entry nobody ever wrote"/);
});

// R3 - documents are registered.

test('R3 passes when every document in reviews/ is in the index', () => {
  const dir = h.makeRepo();
  h.write(dir, 'reviews/storage.md', '# Storage options\n');
  h.setupLogbook(dir, { hash: h.headHash(dir), indexRows: [REVIEW_ROW] });
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 0, r.output);
});

test('R3 fails on a document that is not in the index', () => {
  const dir = h.makeRepo();
  h.write(dir, 'reviews/storage.md', '# Storage options\n');
  h.write(dir, 'reviews/2026-09-01-retry-policy.md', '# Retry policy\n');
  h.setupLogbook(dir, { hash: h.headHash(dir), indexRows: [REVIEW_ROW] });
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /R3 reviews\/2026-09-01-retry-policy\.md is not registered in the document index/);
  assert.doesNotMatch(r.output, /R3 reviews\/storage\.md is not registered/);
});

test('R3 is silent when the registered directory does not exist', () => {
  const dir = h.makeRepo();
  h.setupLogbook(dir, { hash: h.headHash(dir) });
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.output, /none of the registered directories exist/);
});

test('R3 honours registeredDirs from .logbookrc.json', () => {
  const dir = h.makeRepo();
  h.write(dir, '.logbookrc.json', JSON.stringify({ registeredDirs: ['notes'] }, null, 2));
  h.write(dir, 'reviews/unregistered.md', '# not watched\n');
  h.write(dir, 'notes/design.md', '# watched\n');
  h.setupLogbook(dir, { hash: h.headHash(dir) });
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /notes\/design\.md is not registered/);
  assert.doesNotMatch(r.output, /reviews\/unregistered\.md is not registered/);
});

// R4 - facts carry sources.

test('R4 passes when every fact carries a source', () => {
  const dir = h.makeRepo();
  const hash = h.headHash(dir);
  h.setupLogbook(dir, {
    hash,
    entry: `## 2026-08-31 — Three sourced facts

Baseline: ${hash}

Facts:
- The worker opens one connection (src: app.js:1)
- The benchmark reports 1200 rows per second (src: $ node bench.js)
- Upstream documents the limit (src: https://example.com/docs)
`,
  });
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 0, r.output);
});

test('R4 fails on a fact with no source', () => {
  const dir = h.makeRepo();
  const hash = h.headHash(dir);
  h.setupLogbook(dir, {
    hash,
    entry: `## 2026-08-31 — One sourced fact and one bare claim

Baseline: ${hash}

Facts:
- The worker opens one connection (src: app.js:1)
- Postgres would be slower here
`,
  });
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /R4 Fact has no source: "Postgres would be slower here"/);
  assert.match(r.output, /move the line under Assumptions:/);
  assert.match(r.output, /journal\/2026-08-31\.md:9/);
});

test('R4 ignores unsourced lines under Assumptions', () => {
  const dir = h.makeRepo();
  const hash = h.headHash(dir);
  h.setupLogbook(dir, {
    hash,
    entry: `## 2026-08-31 — Facts and guesses kept apart

Baseline: ${hash}

Facts:
- The worker opens one connection (src: app.js:1)

Assumptions:
- Postgres would be slower here
- Nobody runs this on a network filesystem
`,
  });
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 0, r.output);
});

test('R4 accepts a source placed after a pasted command transcript', () => {
  const dir = h.makeRepo();
  const hash = h.headHash(dir);
  h.setupLogbook(dir, {
    hash,
    entry: `## 2026-08-31 — Fact with a transcript

Baseline: ${hash}

Facts:
- The test suite passes on this baseline:

  \`\`\`
  $ node --test test/
  # pass 21
  - this dash is inside a fence and is not a new fact
  \`\`\`

  (src: $ node --test test/)
`,
  });
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 0, r.output);
});

// R5 - journal history is append-only.

test('R5 passes when a committed journal only grows', () => {
  const dir = h.makeRepo();
  const hash = h.headHash(dir);
  h.setupLogbook(dir, { hash });
  h.git(dir, ['add', '-A']);
  h.git(dir, ['commit', '-q', '-m', 'logbook']);

  const file = path.join(dir, 'journal', '2026-08-31.md');
  fs.appendFileSync(
    file,
    `\n## 2026-08-31 — A second entry appended later\n\nBaseline: ${hash}\n\nFacts:\n- Appending is allowed (src: app.js)\n`
  );
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 0, r.output);
});

test('R5 fails when committed journal history is rewritten', () => {
  const dir = h.makeRepo();
  const hash = h.headHash(dir);
  h.setupLogbook(dir, { hash });
  h.git(dir, ['add', '-A']);
  h.git(dir, ['commit', '-q', '-m', 'logbook']);

  const file = path.join(dir, 'journal', '2026-08-31.md');
  const rewritten = fs
    .readFileSync(file, 'utf8')
    .replace('Keep the cache in one SQLite file.', 'Keep the cache in one Postgres table.');
  fs.writeFileSync(file, rewritten);

  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /R5 Committed journal history was rewritten/);
  assert.match(r.output, /Corrects:/);
});

test('R5 fails when a committed entry is deleted', () => {
  const dir = h.makeRepo();
  const hash = h.headHash(dir);
  h.setupLogbook(dir, { hash });
  h.git(dir, ['add', '-A']);
  h.git(dir, ['commit', '-q', '-m', 'logbook']);

  const file = path.join(dir, 'journal', '2026-08-31.md');
  fs.writeFileSync(file, '# Journal 2026-08-31\n');
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /R5 Committed journal history was rewritten/);
});

test('R5 passes for a journal file that is not committed yet', () => {
  const dir = h.makeRepo();
  h.setupLogbook(dir, { hash: h.headHash(dir) });
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 0, r.output);
});

// Reporting.

test('check reports every violation at once with a per-rule count', () => {
  const dir = h.makeRepo();
  h.write(dir, 'reviews/storage.md', '# Storage options\n');
  h.setupLogbook(dir, {
    indexRows: ['| [reviews/gone.md](reviews/gone.md) | vanished | stale |'],
    entry: `## 2026-08-31 — Broken in several ways

Baseline: 0123456789abcdef0123456789abcdef01234567

Facts:
- A claim with no source
`,
  });
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /R1:1/);
  assert.match(r.output, /R2:1/);
  assert.match(r.output, /R3:1/);
  assert.match(r.output, /R4:1/);
  assert.match(r.output, /logbook check failed: 4 problems/);
});

test('check warns about a heading that is not an entry', () => {
  const dir = h.makeRepo();
  const hash = h.headHash(dir);
  h.setupLogbook(dir, { hash, entry: `${h.goodEntry(hash)}\n## Scratch notes\n\nnot an entry\n` });
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.output, /warning: Heading "Scratch notes" is not an entry/);
});

test('check rejects an unreadable .logbookrc.json instead of ignoring it', () => {
  const dir = h.makeRepo();
  h.setupLogbook(dir, { hash: h.headHash(dir) });
  h.write(dir, '.logbookrc.json', '{ not json');
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /\.logbookrc\.json is not valid JSON/);
});
