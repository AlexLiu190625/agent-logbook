'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers');

test('init creates the ledger and the journal directory', () => {
  const dir = h.makeRepo();
  const r = h.run(dir, ['init']);
  assert.strictEqual(r.status, 0, r.output);
  assert.ok(fs.existsSync(path.join(dir, 'LEDGER.md')));
  assert.ok(fs.existsSync(path.join(dir, 'journal')));
  assert.match(h.read(dir, 'LEDGER.md'), /## Document index/);
});

test('init refuses to overwrite an existing ledger', () => {
  const dir = h.makeRepo();
  assert.strictEqual(h.run(dir, ['init']).status, 0);
  h.write(dir, 'LEDGER.md', '# my own ledger\n');
  const r = h.run(dir, ['init']);
  assert.strictEqual(r.status, 1);
  assert.match(r.output, /refused/);
  assert.match(r.output, /LEDGER\.md/);
  assert.strictEqual(h.read(dir, 'LEDGER.md'), '# my own ledger\n');
});

test('add appends entries to today\'s journal file', () => {
  const dir = h.makeRepo();
  h.run(dir, ['init']);
  const first = h.run(dir, ['add', 'First thing']);
  assert.strictEqual(first.status, 0, first.output);
  const match = /Appended an entry to (journal\/\d{4}-\d{2}-\d{2}\.md):(\d+)/.exec(first.stdout);
  assert.ok(match, first.output);
  const journal = match[1];
  assert.match(h.read(dir, journal), /## \d{4}-\d{2}-\d{2} — First thing/);

  h.run(dir, ['add', 'Second thing']);
  const text = h.read(dir, journal);
  assert.match(text, /## \d{4}-\d{2}-\d{2} — Second thing/);
  assert.strictEqual(text.match(/^## /gm).length, 2);
});

test('add refuses to run outside a ledger', () => {
  const dir = h.makeRepo();
  const r = h.run(dir, ['add', 'nothing to append to']);
  assert.strictEqual(r.status, 1);
  assert.match(r.output, /ledger init/);
});

test('check finds the ledger from a subdirectory', () => {
  const dir = h.makeRepo();
  h.setupLedger(dir, { hash: h.headHash(dir) });
  fs.mkdirSync(path.join(dir, 'src', 'deep'), { recursive: true });
  const r = h.run(path.join(dir, 'src', 'deep'), ['check']);
  assert.strictEqual(r.status, 0, r.output);
  assert.match(r.output, /passed/);
});

test('an unfilled template entry does not pass check', () => {
  const dir = h.makeRepo();
  h.run(dir, ['init']);
  h.run(dir, ['add', 'Something I have not written up yet']);
  const r = h.run(dir, ['check']);
  assert.strictEqual(r.status, 1, r.output);
  assert.match(r.output, /template placeholder/);
});

test('unknown commands exit with a usage error', () => {
  const dir = h.makeRepo();
  const r = h.run(dir, ['frobnicate']);
  assert.strictEqual(r.status, 2);
  assert.match(r.output, /Unknown command/);
});
