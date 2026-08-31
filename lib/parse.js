'use strict';

// Parser for the logbook entry syntax. See docs/FORMAT.md for the definition
// this file implements; the spec is authoritative, this is the implementation.

const FIELDS = ['baseline', 'corrects', 'decision', 'facts', 'assumptions', 'next'];

const ENTRY_HEADING = /^##(?!#)\s+(.*\S)\s*$/;
const ANY_HEADING = /^#{1,6}\s+/;
// A heading is an entry only when its text starts with an ISO date. Everything
// else is ordinary prose, so a journal file can carry normal sections too.
const ENTRY_TITLE = /^(\d{4}-\d{2}-\d{2})(?:\s+\d{2}:\d{2})?\s*(?:[-–—:]+)\s*(.*\S)\s*$/;
const FIELD_LINE = /^([A-Za-z][A-Za-z]*):[ \t]*(.*)$/;
const BULLET = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/;
const LINK = /!?\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
const SOURCE_TAG = /\(src:\s*([^)]*)\)/;

// Marks lines that sit inside a fenced code block. Structural syntax is not
// recognised there, so a pasted command transcript cannot be mistaken for
// bullets or headings.
function markFences(lines) {
  const fenced = new Array(lines.length).fill(false);
  let openMarker = null;
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(`{3,}|~{3,})/.exec(lines[i]);
    if (openMarker === null) {
      if (m) {
        openMarker = m[1];
        fenced[i] = true;
      }
    } else {
      fenced[i] = true;
      if (m && m[1][0] === openMarker[0] && m[1].length >= openMarker.length) {
        openMarker = null;
      }
    }
  }
  return fenced;
}

function parseItems(lines, fenced, start, end, inline, inlineLine) {
  const items = [];
  let current = null;
  if (inline && inline.trim()) {
    current = { text: inline.trim(), line: inlineLine, block: [inline] };
    items.push(current);
  }
  for (let i = start; i < end; i++) {
    const line = lines[i];
    const bullet = fenced[i] ? null : BULLET.exec(line);
    if (bullet && bullet[1].length < 2) {
      current = { text: bullet[2].trim(), line: i + 1, block: [bullet[2]] };
      items.push(current);
    } else if (current) {
      current.block.push(line);
    }
  }
  for (const item of items) item.blockText = item.block.join('\n');
  return items;
}

function parseFields(lines, fenced, start, end) {
  const marks = [];
  for (let i = start; i < end; i++) {
    if (fenced[i]) continue;
    const m = FIELD_LINE.exec(lines[i]);
    if (!m) continue;
    marks.push({ raw: m[1], name: m[1].toLowerCase(), inline: m[2], index: i });
  }
  const fields = {};
  const unknown = [];
  for (let k = 0; k < marks.length; k++) {
    const mark = marks[k];
    if (!FIELDS.includes(mark.name)) {
      unknown.push({ name: mark.raw, line: mark.index + 1 });
      continue;
    }
    const stop = k + 1 < marks.length ? marks[k + 1].index : end;
    fields[mark.name] = {
      name: mark.name,
      line: mark.index + 1,
      inline: mark.inline.trim(),
      items: parseItems(lines, fenced, mark.index + 1, stop, mark.inline, mark.index + 1),
    };
  }
  return { fields, unknown };
}

function tokenizeBaseline(text, line, tokens) {
  // `<...>` is an unfilled template placeholder and is one token however many
  // words it contains, otherwise its prose would be reported word by word.
  const rest = text.replace(/<[^>]*>?/g, (match) => {
    tokens.push({ raw: match, repo: null, hash: match, line, placeholder: true, valid: false });
    return ' ';
  });
  for (const part of rest.split(/[,;\s]+/)) {
    const value = part.trim().replace(/[.,;]+$/, '');
    if (!value) continue;
    const at = value.lastIndexOf('@');
    const repo = at > 0 ? value.slice(0, at) : null;
    const hash = at > 0 ? value.slice(at + 1) : value;
    tokens.push({
      raw: value,
      repo,
      hash,
      line,
      placeholder: false,
      valid: /^[0-9a-fA-F]{7,40}$/.test(hash),
    });
  }
}

function parseBaselineTokens(field) {
  if (!field) return [];
  const tokens = [];
  if (field.items.length) {
    // One bullet may list several hashes for one logical baseline.
    for (const item of field.items) tokenizeBaseline(item.text, item.line, tokens);
  } else if (field.inline) {
    tokenizeBaseline(field.inline, field.line, tokens);
  }
  return tokens;
}

function parseLinks(text) {
  const lines = text.split('\n');
  const fenced = markFences(lines);
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue;
    LINK.lastIndex = 0;
    let m;
    while ((m = LINK.exec(lines[i])) !== null) {
      found.push({ target: m[1], line: i + 1 });
    }
  }
  return found;
}

function parseEntries(text) {
  const lines = text.split('\n');
  const fenced = markFences(lines);
  const boundaries = [];
  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue;
    if (ANY_HEADING.test(lines[i])) boundaries.push(i);
  }
  const entries = [];
  const strayHeadings = [];
  for (let b = 0; b < boundaries.length; b++) {
    const i = boundaries[b];
    const heading = ENTRY_HEADING.exec(lines[i]);
    if (!heading) continue;
    const title = ENTRY_TITLE.exec(heading[1]);
    if (!title) {
      strayHeadings.push({ text: heading[1], line: i + 1 });
      continue;
    }
    const end = b + 1 < boundaries.length ? boundaries[b + 1] : lines.length;
    const { fields, unknown } = parseFields(lines, fenced, i + 1, end);
    entries.push({
      date: title[1],
      topic: title[2],
      heading: heading[1],
      line: i + 1,
      endLine: end,
      fields,
      unknownFields: unknown,
      baselines: parseBaselineTokens(fields.baseline),
      isCorrection: Boolean(fields.corrects),
    });
  }
  return { entries, strayHeadings };
}

// The index table under the "Document index" heading of LOGBOOK.md.
function parseIndexTable(text) {
  const lines = text.split('\n');
  const fenced = markFences(lines);
  let start = -1;
  let headingLine = 1;
  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue;
    const m = /^#{1,6}\s+(.*\S)\s*$/.exec(lines[i]);
    if (m && /^documents?\s+index$/i.test(m[1].trim())) {
      start = i + 1;
      headingLine = i + 1;
      break;
    }
  }
  if (start === -1) return { found: false, rows: [], headingLine: 1 };
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (!fenced[i] && ANY_HEADING.test(lines[i])) {
      end = i;
      break;
    }
  }
  const rows = [];
  for (let i = start; i < end; i++) {
    if (fenced[i] || !/^\s*\|/.test(lines[i])) continue;
    const cells = lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
    if (cells.every((c) => /^\s*:?-{2,}:?\s*$/.test(c))) continue;
    rows.push({ cells: cells.map((c) => c.trim()), line: i + 1 });
  }
  return { found: true, rows, headingLine };
}

function sourceOf(item) {
  const m = SOURCE_TAG.exec(item.blockText);
  if (!m) return null;
  const value = m[1].trim();
  return value ? value : null;
}

module.exports = {
  FIELDS,
  markFences,
  parseEntries,
  parseFields,
  parseItems,
  parseLinks,
  parseIndexTable,
  parseBaselineTokens,
  sourceOf,
};
