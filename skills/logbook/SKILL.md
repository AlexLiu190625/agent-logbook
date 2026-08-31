---
name: logbook
description: Read and write the repository's markdown logbook. Use at the start of a task, before the first edit, to pick up what earlier sessions decided and verified. Use again after finishing work that produced a decision or a verified fact — a choice between options, a root cause, a benchmark result, a discovered constraint — and whenever an earlier logbook entry turns out to be wrong. Also use when asked what was decided before, or why the code is the way it is.
---

# Logbook

The repository keeps a work logbook: `LOGBOOK.md` plus append-only daily files
under `journal/`. It exists because sessions are disposable and repositories are
not. A decision that lives only in a closed session is lost; a decision in the
logbook survives the session, the model, and the person.

`docs/FORMAT.md` in the agent-logbook project is the authoritative syntax. This
file is the working habit.

## Start by reading it

Before touching anything, read the logbook. Not when you sit down to write an
entry — when you pick up the task, before the first edit. The point of the
format is that the last session left a written handover, and a handover nobody
reads is the same as no handover.

In this order:

1. `LOGBOOK.md`, the `Status:` line first. One sentence saying where the work
   actually stands right now, which is the thing you are least likely to guess
   correctly from the code.
2. The `## Document index` in the same file. It tells you which long documents
   exist and, in the status column, which ones no longer hold. Reading a design
   note that was superseded three weeks ago is worse than reading nothing.
3. The most recent files in `journal/`, newest first. Far enough back to cover
   the area you are about to touch.

You are reading for three things: a decision that already settled the question
you were about to reopen, a fact that saves you from measuring something twice,
and an assumption nobody has checked yet — the third being the most useful thing
in the file, because it is where the next real finding usually is.

If what you are about to do contradicts an entry you just read, that is not a
reason to ignore it. It is the reason your work ends in a correction entry, and
you should know that before you start rather than after.

## When to write an entry

Write one after finishing work that produced either a decision or a fact worth
citing later:

- A choice between options, especially the options that were rejected and why.
- A root cause, once it is confirmed rather than suspected.
- A measurement: a benchmark, a timing, a row count.
- A constraint discovered the hard way — an API that fails a certain way, a
  limit that is real.
- A correction of an earlier entry.

The test is what the work produced, never what kind of work it was. Ask one
question: did this leave behind a decision someone could disagree with, or a
fact someone could check? If yes, write it up, however small the diff. If no,
do not, however large the diff.

The same category of work falls on both sides of that line:

- Renaming a project after comparing the candidate names, checking which ones
  collide with existing commands and packages, and rejecting the original —
  write it up. The diff is a rename; what it produced is a decision with
  evidence behind it, and the next person to dislike the name needs to know the
  alternatives were already examined.
- Renaming a variable because the old name was misspelled — do not. Nothing was
  chosen and nothing was learned.
- Reading through a subsystem and finding nothing wrong — do not, unless the
  search ruled out a hypothesis someone else would otherwise spend a day on. In
  that case what it produced is a fact: this is not where the bug is.

Work that produced only a diff is already recorded, in the diff. The logbook is
for what the diff cannot say.

## Before writing

If you skipped the reading at the top, do it now. If the work contradicts an
earlier entry, the new entry is a correction and must say so.

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

`logbook add "topic"` appends this skeleton to today's file with the date already
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

## Keep the status line true

The `Status:` line at the top of `LOGBOOK.md` is the one thing in the logbook
that is meant to be overwritten. When your work changes where the project
stands, rewrite that sentence. Everything else you wrote is frozen the moment it
is committed; this line is the only place that can say what is true now, and it
is the first thing the next session reads.

## Long documents

A design note, a review, or an incident report goes in its own file and gets one
row in the `## Document index` table of `LOGBOOK.md`: the path, a one-line
conclusion, and a status. An unregistered document under a registered directory
fails the check, because a document nobody can find is a document nobody reads.

## Finish by checking

```
logbook check
```

It fails on an unfilled placeholder, a baseline that does not exist, a fact with
no source, a broken link, an unregistered document, and any edit to committed
history. Fix what it reports before committing; do not commit a logbook that does
not pass.

Before handing the work back, check that the delivery is recorded at all:

```
logbook check --require-entry-since <the revision this work started from>
```

That fails when the journal has gained no entry since that revision — the one
failure the five rules cannot catch, because an empty journal breaks none of
them. If a `pre-push` hook is installed it runs this for you against whatever
commit the remote branch is on.

When it fails, the fix is to write the entry, not to get past the gate. An entry
invented to satisfy a check is worse than no entry: it costs the next reader the
time to read it and gives them nothing, and it teaches them that entries in this
repository are not worth reading. If the work genuinely produced no decision and
no citable fact, say so out loud and skip the hook deliberately.
