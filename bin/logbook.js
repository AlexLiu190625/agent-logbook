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
  --require-entry-since <git-ref>
                         With \`check\`: also fail when the journal has gained no
                         new entry since <git-ref>. This is the gate that stops
                         a delivery from shipping unrecorded; the five rules
                         only judge entries that were actually written.
  -h, --help             Show this message.
  -v, --version          Show the version.

Exit codes:
  0  everything passed
  1  rule violations, a delivery with no entry, or the command could not run
  2  wrong usage
`;

const REQUIRE_ENTRY = '--require-entry-since';

// Returns { options, error } so that a malformed invocation is a usage error
// rather than a silently ignored flag.
function parseCheckArgs(args) {
  const options = { requireEntrySince: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === REQUIRE_ENTRY) {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('-')) {
        return { error: `${REQUIRE_ENTRY} needs a git revision, for example \`${REQUIRE_ENTRY} origin/main\`.` };
      }
      options.requireEntrySince = value;
      i += 1;
      continue;
    }
    if (arg.startsWith(`${REQUIRE_ENTRY}=`)) {
      const value = arg.slice(REQUIRE_ENTRY.length + 1);
      if (!value) {
        return { error: `${REQUIRE_ENTRY} needs a git revision, for example \`${REQUIRE_ENTRY}=origin/main\`.` };
      }
      options.requireEntrySince = value;
      continue;
    }
    return { error: `Unknown option for \`logbook check\`: ${arg}` };
  }
  return { options };
}

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
    const parsed = parseCheckArgs(args);
    if (parsed.error) {
      out.err(parsed.error);
      out.err(USAGE.trimEnd());
      return 2;
    }
    const root = ws.findRoot(cwd);
    if (!root) {
      out.err(`No ${ws.LOGBOOK_FILE} found here or in any parent directory. Run \`logbook init\` first.`);
      return 1;
    }
    let result;
    try {
      result = checker.check(root, parsed.options);
    } catch (err) {
      if (err.userFacing) {
        out.err(err.message);
        return 1;
      }
      throw err;
    }
    const text = checker.format(result);
    const failed = checker.failed(result);
    if (failed) out.err(text);
    else out.log(text);
    return failed ? 1 : 0;
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
