'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ws = require('./workspace');

const TEMPLATES = path.join(__dirname, '..', 'templates');

function today(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function init(dir, out) {
  const logbookPath = path.join(dir, ws.LOGBOOK_FILE);
  const journalDir = path.join(dir, ws.JOURNAL_DIR);
  const existing = [];
  if (fs.existsSync(logbookPath)) existing.push(ws.LOGBOOK_FILE);
  if (fs.existsSync(journalDir)) existing.push(`${ws.JOURNAL_DIR}/`);
  if (existing.length) {
    out.err(`logbook init refused: ${existing.join(' and ')} already exist${existing.length === 1 ? 's' : ''} here.`);
    out.err('Nothing was written. Delete or move the existing logbook first if you really want a fresh one.');
    return 1;
  }
  fs.writeFileSync(logbookPath, fs.readFileSync(path.join(TEMPLATES, ws.LOGBOOK_FILE), 'utf8'));
  fs.mkdirSync(journalDir, { recursive: true });
  fs.writeFileSync(path.join(journalDir, '.gitkeep'), '');
  out.log(`Created ${ws.LOGBOOK_FILE}`);
  out.log(`Created ${ws.JOURNAL_DIR}/`);
  out.log('Next: run `logbook add "what you just did"` to write the first entry.');
  return 0;
}

function add(dir, title, out, now = new Date()) {
  const root = ws.findRoot(dir);
  if (!root) {
    out.err(`No ${ws.LOGBOOK_FILE} found here or in any parent directory. Run \`logbook init\` first.`);
    return 1;
  }
  const date = today(now);
  const journalDir = path.join(root, ws.JOURNAL_DIR);
  fs.mkdirSync(journalDir, { recursive: true });
  const file = path.join(journalDir, `${date}.md`);
  const template = fs
    .readFileSync(path.join(TEMPLATES, 'entry.md'), 'utf8')
    .replace(/\{\{DATE\}\}/g, date)
    .replace(/\{\{TITLE\}\}/g, title && title.trim() ? title.trim() : 'Untitled — replace with the topic');

  let body = '';
  if (fs.existsSync(file)) {
    body = fs.readFileSync(file, 'utf8');
    if (body.length && !body.endsWith('\n')) body += '\n';
    if (!body.endsWith('\n\n')) body += '\n';
  } else {
    body = `# Journal ${date}\n\n`;
  }
  const startLine = body.split('\n').length;
  fs.writeFileSync(file, body + template);
  out.log(`Appended an entry to ${ws.relFromRoot(root, file)}:${startLine}`);
  out.log('Fill in the placeholders, then run `logbook check`.');
  return 0;
}

module.exports = { init, add, today };
