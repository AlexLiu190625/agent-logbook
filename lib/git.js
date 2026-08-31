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
  return fileAtRef(cwd, 'HEAD', repoRelPath);
}

// Bytes of a path as committed at any revision, or null when it is absent there.
function fileAtRef(cwd, ref, repoRelPath) {
  const r = git(['show', `${ref}:${repoRelPath}`], cwd, { buffer: true });
  if (r.status !== 0) return null;
  return r.stdout;
}

// The full commit id a revision names, or null when it names nothing this clone
// has. A tag or a branch resolves through to the commit it points at.
function resolveCommit(cwd, ref) {
  const r = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd);
  if (r.status !== 0) return null;
  return r.stdout.trim() || null;
}

function shortHash(cwd, commit) {
  const r = git(['rev-parse', '--short', commit], cwd);
  if (r.status !== 0) return commit.slice(0, 7);
  return r.stdout.trim() || commit.slice(0, 7);
}

// Repository-root-relative paths of every file under a directory at a revision.
// NUL separation keeps paths with spaces or quotes intact.
function filesAtRef(cwd, ref, repoRelDir) {
  const r = git(['ls-tree', '-r', '-z', '--name-only', ref, '--', repoRelDir], cwd);
  if (r.status !== 0) return [];
  return r.stdout.split('\0').filter((name) => name.length > 0);
}

function repoRelative(root, absPath) {
  return path.relative(root, absPath).split(path.sep).join('/');
}

module.exports = {
  git,
  topLevel,
  hasCommits,
  commitExists,
  fileAtHead,
  fileAtRef,
  resolveCommit,
  shortHash,
  filesAtRef,
  repoRelative,
};
