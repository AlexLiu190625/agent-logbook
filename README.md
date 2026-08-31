# agent-logbook

On Monday you asked an AI assistant to pick a storage engine. It compared three,
rejected Postgres because the cache has to work without a server the user runs,
and you agreed. On Thursday you open a new session — maybe a different model
entirely — and ask why the cache is a single SQLite file. Nobody knows. The
comparison happened, the reasoning was sound, and it now exists only inside a
conversation that has been closed.

agent-logbook is a file format for writing that down, and a checker that stops
the file from rotting. The state that matters between sessions — decisions,
verified facts, guesses, corrections — lives in plain markdown in the
repository, next to the code it explains, in the same commit and the same diff.

There is no server, no database, and no retrieval index. There is a directory of
markdown files and a script that refuses to let them lie.

## What a logbook looks like

`logbook init` creates `LOGBOOK.md` and `journal/`. Entries go in daily files:

```markdown
## 2026-08-31 — Chose SQLite over Postgres for the local cache

Baseline: bca432f

Decision:
- Keep the cache in a single SQLite file next to the workspace. Postgres is out:
  it needs a server the user has to run.

Facts:
- The cache is opened once per worker process, not once per request (src: src/cache.js)
- The comparison is written up in
  [../reviews/2026-08-31-storage.md](../reviews/2026-08-31-storage.md) (src: reviews/2026-08-31-storage.md)

Assumptions:
- Write volume stays under a few hundred rows per second. Guessed from the
  current task rate, not measured.

Next:
- Measure the real write rate before the next release.
```

Three things carry the weight. `Baseline:` pins the entry to a commit, so a
reader six months later knows which version of the code the claims were true
about. Every line under `Facts:` names where it came from. Everything unverified
sits under `Assumptions:`, where it cannot be mistaken for something checked.

## What the checker does

`logbook check` is the reason the format survives contact with real work. An
assistant that writes a plausible-sounding claim with no evidence gets stopped:

```
$ logbook check
journal/2026-08-31.md:13: R4 Fact has no source: "Postgres would be slower here anyway"
    Append a source like (src: lib/parse.js:42), (src: $ npm test), or (src: https://...). If you cannot cite one, move the line under Assumptions:.

logbook check failed: 1 problem (R4:1) across 1 entry.
```

That line was not wrong, exactly. It was a guess wearing the clothes of a fact,
which is the failure that makes a logbook worse than no logbook at all. Moving it
under `Assumptions:` is a valid fix, and an honest one.

Installed as a pre-commit hook, the same check refuses to let already-committed
history be quietly reworded:

```
$ git commit -m "quietly change my mind"
journal/2026-08-31.md:8: R5 Committed journal history was rewritten; the file no longer starts with what was committed.
    Restore the old text and append a new entry with a `Corrects:` field instead of editing the past.

logbook check failed: 1 problem (R5:1) across 1 entry.

Commit stopped: the logbook does not pass its own rules.
Fix the problems above, or commit with --no-verify if you know why you are skipping this.
```

When everything holds:

```
$ logbook check
logbook check passed: 1 entry in 1 journal file.
```

## Install

```
npm install --save-dev agent-logbook
```

Or run it without installing:

```
npx agent-logbook init
```

It needs Node 18 or newer and has no runtime dependencies. Git is used through
the `git` command for the two rules that need history.

## Commands

| Command | What it does |
| --- | --- |
| `logbook init` | Creates `LOGBOOK.md` and `journal/` in the current directory, refusing to overwrite either if it already exists. |
| `logbook add [title]` | Appends a blank entry to today's journal file, dated from the system clock, creating the file if needed. |
| `logbook check` | Runs the five rules and exits non-zero on any violation, printing each one with its file, line, and what to do about it. |

## Rules

| Rule | What it enforces |
| --- | --- |
| R1 | Every entry declares a `Baseline:`, and each hash resolves to a commit that really exists in this repository. |
| R2 | Relative links point at files that exist, and every `Corrects:` names an entry that is really in the journal. |
| R3 | Every file under a registered directory (`reviews/` by default) has a row in the `LOGBOOK.md` document index. |
| R4 | Every item under `Facts:` carries a source: a file, a command, or a URL. |
| R5 | Journal files are append-only — the committed bytes must still be a prefix of the working copy. |

A hash marked as belonging to another repository, written `upstream-sdk@9f8e7d6`,
is reported as skipped rather than checked, since the checker has no copy of that
repository. Outside a git repository R1 and R5 announce that they were skipped,
rather than passing silently and letting a green result mean nothing.

## Wiring it in

Run the checker on every commit:

```
cp node_modules/agent-logbook/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Run it in CI with `.github/workflows/logbook-check.yml` from this repository.
The checkout needs `fetch-depth: 0`, because R5 compares each journal file
against its committed version and cannot do that against a shallow clone.

To teach an assistant the habit, copy `skills/logbook/SKILL.md` into the skills
directory of Claude Code, Codex, or whatever else writes in your repository. It
covers when an entry is worth writing, how to fill one in, and why a correction
is written as a new entry rather than an edit.

## Configuration

`.logbookrc.json` at the logbook root, entirely optional:

```json
{
  "registeredDirs": ["reviews", "docs/decisions"]
}
```

A directory that does not exist is not an error — R3 reports that it had nothing
to check. A `.logbookrc.json` that is not valid JSON is an error, so that a typo
cannot silently switch the rule off.

## The format

`docs/FORMAT.md` is the authoritative definition of the syntax: headings,
fields, the source tag, correction entries, and what the checker deliberately
does not verify. This repository keeps its own logbook under `journal/`, and its
CI runs its own checker over it.

## License

MIT
