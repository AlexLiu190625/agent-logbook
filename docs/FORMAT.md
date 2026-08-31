# Logbook format

This is the authoritative definition of the logbook file syntax. `logbook check`
implements exactly what is written here; where the checker and this document
disagree, this document is the bug report.

Everything is plain Markdown. A logbook renders correctly on GitHub, reads
correctly in a text editor, and diffs correctly in git.

## Layout

```
LOGBOOK.md             the standing summary: document index and change log
journal/YYYY-MM-DD.md  entries written on that date, append-only
.logbookrc.json        optional configuration
```

`journal/` holds one file per calendar date. A date file may hold any number of
entries. Entries are appended; a committed entry is never edited again, with the
single exception described under [a rewritten history](#the-one-exception-to-append-only-a-rewritten-history).

The two files play opposite roles, and that is deliberate. `LOGBOOK.md` is the
pointer layer: it says where things stand now and where the long documents are,
and it is meant to be overwritten as that changes. `journal/` is the record
layer, protected by R5, where nothing is ever overwritten. A reader who wants
the current state reads the first; a reader who wants to know how the state got
there reads the second. Anything that has to be kept current belongs in
`LOGBOOK.md` precisely because editing it is allowed there.

## Entry syntax

An entry is a level-two heading whose text begins with an ISO date, followed by
any number of fields.

```markdown
## 2026-08-31 — Chose SQLite over Postgres for the local cache

Baseline: a1b2c3d

Decision:
- Keep the cache in a single SQLite file next to the workspace.

Facts:
- The cache is opened once per worker process, not once per request (src: src/db.js:41)
- A run of the benchmark reports 1,240 rows per second (src: $ node bench.js)

Assumptions:
- Write volume stays under a few hundred rows per second.

Next:
- Measure the real write rate before the next release.
```

## The entry heading

```
## <YYYY-MM-DD> [HH:MM] <separator> <topic>
```

The separator is one or more of `-`, `–`, `—`, or `:`. The time is optional and
useful only when one date carries many entries.

A level-two heading that does not start with a date is ordinary prose, not an
entry, so a journal file can also hold plain sections. `logbook check` prints a
warning for such headings inside `journal/`, because the usual cause is a typo
in a date that would otherwise make an entry silently invisible.

## Entry fields

A field is a keyword at the start of a line, followed by a colon. Its value is
either the rest of that line, or the bullet list that follows it, or both. A
field ends where the next field or the next heading begins.

| Field | Required | Meaning |
| --- | --- | --- |
| `Baseline:` | yes | The commit or commits this entry's conclusions are pinned to. |
| `Corrects:` | no | Names an earlier entry this one supersedes. Presence makes this a correction entry. |
| `Decision:` | no | What was decided. |
| `Facts:` | no | What is true, each item carrying its source. |
| `Assumptions:` | no | What is believed but not verified. |
| `Next:` | no | The next step. |

Field names are matched case-insensitively. A line like `Note:` that is not one
of these names is ignored, and `logbook check` warns about it so that a
misspelled `Fact:` cannot quietly disable the source requirement.

Fenced code blocks are inert: headings, bullets, and field keywords inside them
are text, so a pasted terminal transcript cannot be mistaken for structure.

## The Baseline field

One or more commit hashes, 7 to 40 hexadecimal characters, separated by
whitespace, commas, or bullets.

```markdown
Baseline: a1b2c3d
Baseline: a1b2c3d, 9f8e7d6
```

A hash in another repository is written `repo-name@hash`:

```markdown
Baseline: a1b2c3d, upstream-sdk@9f8e7d6
```

`logbook check` verifies hashes in the current repository and reports the
external ones as skipped, because it has no copy of that other repository.

## The Facts field and the source tag

Every item under `Facts:` ends with a source tag:

```
(src: <where this came from>)
```

The source is free text, so that all three honest kinds of evidence fit:

| Kind | Example |
| --- | --- |
| A file, optionally a line | `(src: lib/rules.js:120)` |
| A command that was run | `(src: $ node --test)` |
| A URL | `(src: https://example.com/issues/12)` |

The tag may appear anywhere inside the item, including after an indented
transcript, so a fact can quote the output it rests on:

````markdown
Facts:
- The suite passes on this baseline:

  ```
  $ node --test
  # pass 34
  ```

  (src: $ node --test)
````

An item under `Assumptions:` never carries a source. That is the entire point of
the split: the reader can tell at a glance which lines were verified. When a
claim has no source, it belongs under `Assumptions:`, not under `Facts:` with a
vague tag.

## Correction entries

History is never edited. When a conclusion turns out to be wrong, a new entry
supersedes it:

```markdown
## 2026-09-02 — SQLite is not fast enough after all

Corrects: 2026-08-31 — Chose SQLite over Postgres for the local cache

Baseline: 7c4d9a1

Facts:
- The measured write rate is 4,100 rows per second, not the few hundred that
  the earlier entry assumed (src: $ node bench.js)

Decision:
- Move the cache to Postgres.
```

The `Corrects:` value repeats the target entry's heading text: the date, a
separator, and the topic. `logbook check` resolves it against the journal and
fails when no such entry exists.

## The one exception to append-only: a rewritten history

R5 says committed journal text is never touched again. There is exactly one
case where touching it is correct, and it is narrow enough to state precisely.

When the repository's git history is itself rewritten — a rebase, a filter, an
author fix that gives every commit a new id — the commit ids that old entries
carry in `Baseline:` stop resolving. The commits they named no longer exist. An
entry pinned to a commit that is gone is not history preserved; it is a pointer
into nothing, and R1 will fail on it forever.

In that case, and only in that case, the old `Baseline:` values may be rewritten
to the new ids, under three conditions:

1. It happens inside the same rewrite. The remap is part of the operation that
   invalidated the ids, not a later edit that happens to fix them up.
2. Only the baseline hashes change. No other byte of any committed entry moves:
   not the prose, not the facts, not the sources, not the headings — including a
   heading that has since become wrong.
3. Each new id names the same underlying commit as the old one did. The pointer
   is remapped, never repointed. If the rewrite dropped or squashed the commit an
   entry was pinned to, there is no id that satisfies this, and the honest move
   is a new entry recording that the baseline is unrecoverable.

Everything else stays forbidden. A rewrite is not an opportunity to reword a
conclusion that reads badly, and R5 does not distinguish the two: the checker
sees only that committed bytes changed and fails. The rewrite is a deliberate
act by a person who then has to explain it, which is the fourth condition and
the one no tool can enforce — the rewrite gets its own entry saying what was
rewritten and why.

## LOGBOOK.md

`LOGBOOK.md` opens with a `Status:` line and carries two sections that the
checker knows about.

**`Status:`** is one sentence saying where the work stands right now, rewritten
whenever that stops being true:

```markdown
# Logbook

Status: The retry budget is in and measured; the cache migration has not started.
```

No rule inspects it, and it is the one line in the whole format that is meant to
be overwritten rather than appended to. That is why it lives here and not in a
journal entry: a journal entry is true about the moment it was written and stays
that way forever, so it can never answer "where are we now". A reader arriving
cold reads this line first and the journal second.

**`## Document index`** registers every long document that lives outside the
journal, so that a reader who has never seen the repository can find it and know
whether it still holds. The first column carries the path; the rest is free.

```markdown
## Document index

| Document | Conclusion | Status |
| --- | --- | --- |
| [reviews/2026-08-31-storage.md](reviews/2026-08-31-storage.md) | SQLite is fast enough at our write volume | superseded 2026-09-02 |
```

**`## Change log`** is an append region for one-line notes about the logbook
itself. No rule inspects it.

## Links

Relative links resolve against the file that contains them, exactly as GitHub
renders them. A link from `journal/2026-08-31.md` to a review therefore reads
`../reviews/storage.md`. When a link would only resolve from the logbook root,
`logbook check` says so and prints the path to write instead.

Absolute-looking targets such as `/docs/FORMAT.md` resolve from the logbook root.
Targets with a scheme (`https:`, `mailto:`) and bare anchors (`#section`) are
left alone.

## Configuration

`.logbookrc.json` at the logbook root is optional.

```json
{
  "registeredDirs": ["reviews", "docs/decisions"]
}
```

`registeredDirs` lists the directories whose files must appear in the document
index. It defaults to `["reviews"]`. A directory that does not exist is not an
error; the rule reports that it had nothing to check. Files and directories
beginning with a dot are ignored.

## Rules the checker enforces

| Rule | What must hold |
| --- | --- |
| R1 | Every entry declares a `Baseline:`, and each hash in the current repository resolves to a real commit. |
| R2 | Relative links point at files that exist, and every `Corrects:` names an entry that exists. |
| R3 | Every file under a registered directory appears in the document index. |
| R4 | Every item under `Facts:` carries a non-placeholder source tag. |
| R5 | A journal file's committed content is still a byte-exact prefix of the working copy. |

R1 and R5 need git. Outside a repository, or in a repository with no commits,
they report themselves as skipped rather than passing silently.

Violations exit non-zero. Warnings — a heading that is not an entry, an
unrecognised field name — do not.

## The delivery gate

Every rule above judges an entry that exists. An empty journal breaks none of
them, so `logbook check` on a repository whose assistant wrote nothing all day
passes. The gate that closes this is not a rule, because it cannot run without
being told what the delivery is:

```
logbook check --require-entry-since <git-ref>
```

The check then also fails unless the journal holds at least one complete entry
that was not already complete at `<git-ref>`.

**Complete** means the entry declares a `Baseline:` that is a hash rather than
the template placeholder, and has at least one item under `Decision:` or
`Facts:` that is more than placeholder text. Whether that hash resolves and
whether those facts carry sources stays R1's and R4's job; completeness here
only decides whether the entry is a record or an untouched skeleton, so that
running `logbook add` cannot by itself satisfy the gate.

**Not already complete at `<git-ref>`** is decided by the entry's identity,
which is its date and its topic. The comparison reads the journal directory as
it was committed at that revision and compares it with the working copy, so an
entry written for this delivery counts whether or not it has been committed yet.

The revision must resolve to a commit in this clone. One that does not is an
error rather than a pass, so that a misspelled branch name cannot switch the gate
off without saying so. Where there is genuinely nothing to compare against — the
first push of a branch the remote has never seen — the caller leaves the option
off; `hooks/pre-push` does exactly that, and prints why.

## What the format deliberately leaves out

`logbook check` does not verify that a path inside a `(src: ...)` tag exists,
because a source may equally be a command or a URL, and guessing which is which
turns a discipline tool into a source of false alarms. It does not re-run the
commands quoted in sources. It does not check that an entry's prose matches its
baseline. Those are judgements for a reader, and the logbook exists to give that
reader something to judge.
