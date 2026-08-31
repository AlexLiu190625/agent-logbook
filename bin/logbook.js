#!/usr/bin/env node
'use strict';

const path = require('node:path');
const commands = require('../lib/commands');
const checker = require('../lib/check');
const ws = require('../lib/workspace');
const pkg = require('../package.json');

const USAGE = `logbook - a plain-markdown work logbook for AI coding sessions

Usage:
  logbook init           Create LOGBOOK.md and journal/ in the current directory.
  logbook add [title]    Append a blank entry to today's journal file.
  logbook check          Check the logbook against the five rules.

Options:
  -h, --help             Show this message.
  -v, --version          Show the version.

Exit codes:
  0  everything passed
  1  rule violations, or the command could not run
  2  wrong usage
`;

function main(argv, out, cwd) {
  const args = argv.slice();
  if (args.includes('-h') || args.includes('--help') || args.length === 0) {
    out.log(USAGE.trimEnd());
    return args.length === 0 ? 2 : 0;
  }
  if (args.includes('-v') || args.includes('--version')) {
    out.log(pkg.version);
    return 0;
  }
  const command = args.shift();

  if (command === 'init') return commands.init(cwd, out);
  if (command === 'add') return commands.add(cwd, args.join(' '), out);
  if (command === 'check') {
    const root = ws.findRoot(cwd);
    if (!root) {
      out.err(`No ${ws.LOGBOOK_FILE} found here or in any parent directory. Run \`logbook init\` first.`);
      return 1;
    }
    let result;
    try {
      result = checker.check(root);
    } catch (err) {
      if (err.userFacing) {
        out.err(err.message);
        return 1;
      }
      throw err;
    }
    const text = checker.format(result);
    if (result.violations.length) out.err(text);
    else out.log(text);
    return result.violations.length ? 1 : 0;
  }

  out.err(`Unknown command: ${command}`);
  out.err(USAGE.trimEnd());
  return 2;
}

if (require.main === module) {
  const out = {
    log: (s) => process.stdout.write(`${s}\n`),
    err: (s) => process.stderr.write(`${s}\n`),
  };
  process.exitCode = main(process.argv.slice(2), out, path.resolve(process.cwd()));
}

module.exports = { main };
