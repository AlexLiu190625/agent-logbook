'use strict';

// Shared setup for the CLI tests. Every test builds a real git repository in a
// temporary directory and drives bin/logbook.js as a child process, so the tests
// exercise the same code path a user gets.

const { spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BIN = path.join(__dirname, '..', 'bin', 'logbook.js');

function git(dir, args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
}

function makeRepo({ initGit = true, initialCommit = true } = {}) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'agent-logbook-test-'));
  if (initGit) {
    git(dir, ['init', '-q', '-b', 'main', '.']);
    git(dir, ['config', 'user.email', 'test@example.com']);
    git(dir, ['config', 'user.name', 'logbook test']);
    git(dir, ['config', 'commit.gpgsign', 'false']);
  }
  fs.writeFileSync(path.join(dir, 'app.js'), "console.log('hello');\n");
  if (initGit && initialCommit) {
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'initial']);
  }
  return dir;
}

function headHash(dir) {
  return git(dir, ['rev-parse', '--short', 'HEAD']).trim();
}

function run(dir, args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: dir, encoding: 'utf8' });
  return {
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    output: `${r.stdout}${r.stderr}`,
  };
}

function write(dir, relPath, contents) {
  const abs = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
  return abs;
}

function read(dir, relPath) {
  return fs.readFileSync(path.join(dir, relPath), 'utf8');
}

function logbookFile(indexRows = []) {
  return `# Logbook

## Document index

| Document | Conclusion | Status |
| --- | --- | --- |
${indexRows.map((r) => `${r}\n`).join('')}
## Change log

- Logbook created.
`;
}

// A minimal entry that satisfies all five rules, so each test can break exactly
// one thing and be sure the failure it sees is the one it caused.
function goodEntry(hash, { date = '2026-08-31', topic = 'Chose SQLite for the cache' } = {}) {
  return `## ${date} — ${topic}

Baseline: ${hash}

Decision:
- Keep the cache in one SQLite file.

Facts:
- The cache is opened once per worker process (src: app.js)

Assumptions:
- Write volume stays under a few hundred rows per second.

Next:
- Measure the real write rate.
`;
}

function journalFile(hash, opts) {
  const date = (opts && opts.date) || '2026-08-31';
  return `# Journal ${date}\n\n${goodEntry(hash, opts)}`;
}

function setupLogbook(dir, { hash, entry, indexRows, date = '2026-08-31' } = {}) {
  write(dir, 'LOGBOOK.md', logbookFile(indexRows));
  fs.mkdirSync(path.join(dir, 'journal'), { recursive: true });
  const body = entry !== undefined ? entry : goodEntry(hash, { date });
  write(dir, `journal/${date}.md`, `# Journal ${date}\n\n${body}`);
}

// Puts a `logbook` executable where the sample hooks look for one, so a hook
// test drives the real CLI instead of a stand-in.
function installBinShim(dir) {
  const binDir = path.join(dir, 'node_modules', '.bin');
  fs.mkdirSync(binDir, { recursive: true });
  const shim = path.join(binDir, 'logbook');
  fs.writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${BIN}" "$@"\n`);
  fs.chmodSync(shim, 0o755);
  return shim;
}

function installHook(dir, name) {
  const target = path.join(dir, '.git', 'hooks', name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '..', 'hooks', name), target);
  fs.chmodSync(target, 0o755);
  return target;
}

// Runs a hook the way git does: as a program, with the ref lines on stdin.
function runHook(dir, name, stdin = '') {
  const r = spawnSync(path.join(dir, '.git', 'hooks', name), [], {
    cwd: dir,
    encoding: 'utf8',
    input: stdin,
  });
  return {
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    output: `${r.stdout}${r.stderr}`,
  };
}

const ZERO_SHA = '0000000000000000000000000000000000000000';

module.exports = {
  BIN,
  ZERO_SHA,
  git,
  installBinShim,
  installHook,
  runHook,
  makeRepo,
  headHash,
  run,
  write,
  read,
  logbookFile,
  goodEntry,
  journalFile,
  setupLogbook,
};
