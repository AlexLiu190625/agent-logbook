'use strict';

const fs = require('node:fs');
const path = require('node:path');
const git = require('./git');

const LEDGER_FILE = 'LEDGER.md';
const JOURNAL_DIR = 'journal';
const CONFIG_FILE = '.ledgerrc.json';
const DEFAULT_REGISTERED_DIRS = ['reviews'];

// The ledger root is the nearest ancestor holding LEDGER.md, so the CLI and the
// pre-commit hook behave the same from any subdirectory.
function findRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, LEDGER_FILE))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function loadConfig(root) {
  const file = path.join(root, CONFIG_FILE);
  if (!fs.existsSync(file)) {
    return { registeredDirs: DEFAULT_REGISTERED_DIRS.slice(), source: null };
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    const e = new Error(`${CONFIG_FILE} is not valid JSON: ${err.message}`);
    e.userFacing = true;
    throw e;
  }
  const dirs = raw.registeredDirs;
  if (dirs !== undefined && (!Array.isArray(dirs) || dirs.some((d) => typeof d !== 'string'))) {
    const e = new Error(`${CONFIG_FILE}: "registeredDirs" must be an array of strings.`);
    e.userFacing = true;
    throw e;
  }
  return {
    registeredDirs: dirs ? dirs.slice() : DEFAULT_REGISTERED_DIRS.slice(),
    source: CONFIG_FILE,
  };
}

function journalFiles(root) {
  const dir = path.join(root, JOURNAL_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => path.join(dir, name));
}

function listFilesRecursive(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

function gitContext(root) {
  const top = git.topLevel(root);
  if (!top) return { inRepo: false, root: null, hasCommits: false };
  return { inRepo: true, root: top, hasCommits: git.hasCommits(root) };
}

function relFromRoot(root, absPath) {
  return path.relative(root, absPath).split(path.sep).join('/');
}

module.exports = {
  LEDGER_FILE,
  JOURNAL_DIR,
  CONFIG_FILE,
  DEFAULT_REGISTERED_DIRS,
  findRoot,
  loadConfig,
  journalFiles,
  listFilesRecursive,
  gitContext,
  relFromRoot,
};
