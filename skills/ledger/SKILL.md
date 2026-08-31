---
name: ledger
description: Record work in the repository's markdown ledger. Use after finishing a piece of work that produced a decision or a verified fact — a choice between options, a root cause, a benchmark result, a discovered constraint — and whenever an earlier ledger entry turns out to be wrong. Also use when asked what was decided before, or why the code is the way it is.
---

# Ledger

The repository keeps a work ledger: `LEDGER.md` plus append-only daily files
under `journal/`. It exists because sessions are disposable and repositories are
not. A decision that lives only in a closed session is lost; a decision in the
ledger survives the session, the model, and the person.

`docs/FORMAT.md` in the agent-ledger project is the authoritative syntax. This
file is the working habit.

## When to write an entry

Write one after finishing work that produced either a decision or a fact worth
citing later:

- A choice between options, especially the options that were rejected and why.
- A root cause, once it is confirmed rather than suspected.
- A measurement: a benchmark, a timing, a row count.
- A constraint discovered the hard way — an API that fails a certain way, a
  limit that is real.
- A correction of an earlier entry.

Do not write one for work that produced nothing durable: a rename, a typo fix,
a search that found nothing.

## Before writing

Read the recent journal files first. If the work contradicts an earlier entry,
the new entry is a correction and must say so.

Get the baseline from the repository, never from memory:

```
git rev-parse --short HEAD
```

## The entry

```markdown
## 2026-08-31 — Chose SQLite over Postgres for the local cache

Baseline: a1b2c3d

Decision:
- Keep the cache in a single SQLite file next to the workspace. Postgres is out
  because it needs a server the user has to run.

Facts:
- The cache is opened once per worker process, not once per request (src: src/db.js:41)
- The benchmark reports 1,240 rows per second on this machine (src: $ node bench.js)

Assumptions:
- Write volume stays under a few hundred rows per second. This is a guess from
  the current task rate, not a measurement.

Next:
- Measure the real write rate before the next release.
```

`ledger add "topic"` appends this skeleton to today's file with the date already
filled in.

## The two rules that matter most

**Facts and assumptions never mix.** Every line under `Facts:` ends with
`(src: ...)` naming the file, the command, or the URL it came from. A claim that
cannot cite one of those three is not a fact; it goes under `Assumptions:`,
where a later reader knows to distrust it. Writing a guess as a fact is the one
failure this format exists to prevent, and the checker will reject it.

**History is appended, never edited.** A committed entry stays exactly as
written even when it turns out to be wrong. To supersede it, write a new entry
naming the old one:

```markdown
## 2026-09-02 — SQLite is not fast enough after all

Corrects: 2026-08-31 — Chose SQLite over Postgres for the local cache

Baseline: 7c4d9a1

Facts:
- The measured write rate is 4,100 rows per second (src: $ node bench.js)

Decision:
- Move the cache to Postgres.
```

The wrong entry stays visible. A reader who finds only the correction learns
what is true now; a reader who follows the chain also learns why the earlier
conclusion was reasonable at the time, which is what stops the same mistake from
being made a third time.

## Long documents

A design note, a review, or an incident report goes in its own file and gets one
row in the `## Document index` table of `LEDGER.md`: the path, a one-line
conclusion, and a status. An unregistered document under a registered directory
fails the check, because a document nobody can find is a document nobody reads.

## Finish by checking

```
ledger check
```

It fails on an unfilled placeholder, a baseline that does not exist, a fact with
no source, a broken link, an unregistered document, and any edit to committed
history. Fix what it reports before committing; do not commit a ledger that does
not pass.
