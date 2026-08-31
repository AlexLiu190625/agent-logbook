# Ledger

Working state for this repository: what was decided, what was verified, and
where the long documents live.

Daily entries live in `journal/YYYY-MM-DD.md`. Entries are append-only. A past
entry is never edited; when a conclusion turns out to be wrong, a new entry
with a `Corrects:` field supersedes it.

This project keeps its own ledger, and its CI runs its own checker over it.

## Document index

Every long document (design note, review, incident report) is registered here,
so that someone who has never seen this repository can find it and know whether
it still holds.

| Document | Conclusion | Status |
| --- | --- | --- |
| [docs/FORMAT.md](docs/FORMAT.md) | The authoritative entry syntax; the checker implements exactly this | current |

## Change log

One line per meaningful change to this file.

- 2026-08-31 Ledger created; document index points at the format spec.
