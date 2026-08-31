# agent-logbook

On Monday you asked an AI assistant to pick a storage engine. It compared three,
rejected Postgres because the cache has to work without a server the user runs,
and you agreed. On Thursday you open a new session — maybe a different model
entirely — and ask why the cache is a single SQLite file. Nobody knows. The
comparison happened, the reasoning was sound, and it now exists only inside a
conversation that has been closed.

A logbook, on a ship or in a cockpit, is the formal record kept as the voyage
happens: written in order, and never amended afterwards. It exists for the
handover. Whoever comes on watch next reads it and picks up where the last watch
left off, without having been there.

agent-logbook does that for AI sessions. The next watch is the next session,
often a different model, and it should inherit a written record rather than
start from nothing. So this is a file format for writing that record down, and a
checker that stops the file from rotting. The state that matters between
sessions — decisions, verified facts, guesses, corrections — lives in plain
markdown in the repository, next to the code it explains, in the same commit and
the same diff.

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
which is the failure that makes a logbook worse than no logbook at all. Moving
it under `Assumptions:` is a valid fix, and an honest one.

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

## The check that something was written at all

The five rules judge entries that exist. None of them can catch the failure
that actually happens: an assistant finishes a day of work, writes no entry,
and `logbook check` passes on an empty journal because nothing in it is wrong.

`--require-entry-since` closes that. Give it the revision the delivery started
from — the commit the remote branch is on, the base of the pull request — and
the check also fails when the journal has gained nothing since:

Both transcripts below are from this repository's own history — the same
delivery, checked before and after its journal entry was written:

```
$ logbook check --require-entry-since 61e6f51
This delivery is not recorded in the logbook: no entry has been added since 61e6f51.
    Write one before shipping: `logbook add "what you just did"`, then fill in Baseline:,
    Decision: and Facts: and commit the journal file alongside the change.
    If this change genuinely produced no decision and no fact worth citing, skip the gate
    deliberately (git push --no-verify) rather than writing an empty entry to get past it.

logbook check failed: this delivery has no new logbook entry since 61e6f51.
```

An entry counts when it is pinned to a `Baseline:` and says something under
`Decision:` or `Facts:`. An untouched `logbook add` skeleton does not count,
which stops the gate from being satisfied by running one command.

When it is satisfied, it says which revision it compared against:

```
$ logbook check --require-entry-since 61e6f51
note: require-entry-since 61e6f51: 1 new entry in the journal.

logbook check passed: 7 entries in 1 journal file.
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
| `logbook check --require-entry-since <git-ref>` | The same, and also fails when the journal has gained no entry since `<git-ref>`. |

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

`--require-entry-since` is deliberately not one of the five. The rules run
everywhere and need no argument; the delivery gate needs to be told what the
delivery is, so it only runs when a caller names a revision.

## Wiring it in

Run the checker on every commit:

```
cp node_modules/agent-logbook/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Refuse to push work that was never written up:

```
cp node_modules/agent-logbook/hooks/pre-push .git/hooks/pre-push
chmod +x .git/hooks/pre-push
```

git tells the pre-push hook which commit each remote branch is on, and the hook
passes that commit to `--require-entry-since`. So the comparison is against what
the remote already has, not against your last commit. Pushing a branch the
remote has never seen has nothing to compare against; the hook says so and lets
the push through rather than blocking a first push or passing in silence:

```
$ git push -u origin main
logbook: refs/heads/main does not exist on the remote yet, so there is no revision to compare
logbook: against. The new-entry check is skipped for this first push; the rules still run.
logbook check passed: 2 entries in 1 journal file.
```

Run it in CI with `.github/workflows/logbook-check.yml` from this repository.
The checkout needs `fetch-depth: 0`, because R5 compares each journal file
against its committed version and cannot do that against a shallow clone. On a
pull request, adding `--require-entry-since origin/${{ github.base_ref }}` makes
CI enforce the same thing the pre-push hook does, for anyone who pushed with
`--no-verify`.

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

## Scope

One repository, one logbook. `logbook check` finds the nearest `LOGBOOK.md` at
or above the working directory and treats that as the whole world.

Several lines of work going on in the same repository at the same time therefore
share one journal, and their entries interleave by date rather than sitting in
separate streams. Reading back what happened on one of them means reading past
the others. This is a real limitation, not a feature: the format has no notion
of a work stream, and no plan to grow one until a repository with that problem
says what it actually needs.

## The format

`docs/FORMAT.md` is the authoritative definition of the syntax: headings,
fields, the source tag, correction entries, and what the checker deliberately
does not verify. This repository keeps its own logbook under `journal/`, and its
CI runs its own checker over it.

## License

MIT
