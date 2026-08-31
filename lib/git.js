'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

function git(args, cwd, opts = {}) {
  return spawnSync('git', args, {
    cwd,
    encoding: opts.buffer ? 'buffer' : 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function topLevel(cwd) {
  const r = git(['rev-parse', '--show-toplevel'], cwd);
  if (r.status !== 0) return null;
  return r.stdout.trim() || null;
}

function hasCommits(cwd) {
  return git(['rev-parse', '--verify', '--quiet', 'HEAD'], cwd).status === 0;
}

function commitExists(cwd, hash) {
  return git(['cat-file', '-e', `${hash}^{commit}`], cwd).status === 0;
}

// Bytes of a path as committed at HEAD, or null when the path is absent there.
function fileAtHead(cwd, repoRelPath) {
  const r = git(['show', `HEAD:${repoRelPath}`], cwd, { buffer: true });
  if (r.status !== 0) return null;
  return r.stdout;
}

function repoRelative(root, absPath) {
  return path.relative(root, absPath).split(path.sep).join('/');
}

module.exports = { git, topLevel, hasCommits, commitExists, fileAtHead, repoRelative };
