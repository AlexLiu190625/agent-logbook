# Logbook

Status: Published on GitHub and npm at 0.1.0; the format, the five
rules and the `--require-entry-since` delivery gate are in place, and the open
question is whether the gate is bearable in daily use.

Working state for this repository: what was decided, what was verified, and
where the long documents live.

Daily entries live in `journal/YYYY-MM-DD.md`. Entries are append-only. A past
entry is never edited; when a conclusion turns out to be wrong, a new entry
with a `Corrects:` field supersedes it.

This file is the opposite: it is meant to be overwritten. `Status:` above is the
one line that always describes now, which is why it lives here rather than in a
journal entry, where it would be frozen at the moment it was written.

This project keeps its own logbook, and its CI runs its own checker over it.

## Document index

Every long document (design note, review, incident report) is registered here,
so that someone who has never seen this repository can find it and know whether
it still holds.

| Document | Conclusion | Status |
| --- | --- | --- |
| [docs/FORMAT.md](docs/FORMAT.md) | The authoritative entry syntax; the checker implements exactly this | current |

## Change log

One line per meaningful change to this file.

- 2026-08-31 Logbook created; document index points at the format spec.
- 2026-08-31 Renamed from agent-ledger to agent-logbook; this file was
  `LEDGER.md` and the command was `ledger`. See the correction entry in
  [journal/2026-08-31.md](journal/2026-08-31.md).
- 2026-08-31 Published to GitHub; npm publication still pending.
- 2026-08-31 Commit authorship rewritten and force-pushed after a wrong
  repo-local git identity; baselines in earlier entries remapped in the same
  rewrite.
- 2026-08-31 Added a `Status:` line at the top of this file, the one line here
  that is rewritten rather than appended to. Added the
  `--require-entry-since` delivery gate and the `hooks/pre-push` sample that
  drives it; wrote R5's history-rewrite exception into
  [docs/FORMAT.md](docs/FORMAT.md).
- 2026-08-31 Published 0.1.0 to npm; npx install path verified.
- 2026-08-31 The README now opens with `assets/demo.gif`, a recorded session of
  the checker refusing an unfilled entry and then a quietly reworded committed
  one. What the recording leaves out, and why, is in
  [journal/2026-08-31.md](journal/2026-08-31.md).
