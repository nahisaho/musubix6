---
feature: compaction
tier: T2
approval: auto
---
# compaction
Goal: merge sorted entry streams (memtable/SSTable cursors) into new non-overlapping SSTables while garbage-collecting shadowed versions and tombstones without changing what any live snapshot can observe; plus level selection helpers. Non-goals: scheduling, background threads, file I/O.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CMP-001 | When merging N sorted cursors, MergeIterator shall yield all entries in internal order (key asc, seq desc). | TEST-CMP-001 |
| REQ-CMP-002 | If there are zero cursors or all are empty, then MergeIterator shall be invalid from the start; empty cursors among non-empty ones shall be ignored. | TEST-CMP-002 |
| REQ-CMP-003 | When several cursors carry the same (key,seq), MergeIterator shall yield it once, taking the value of the lowest-index (newest) cursor. | TEST-CMP-003 |
| REQ-CMP-004 | When compacting with oldest_snapshot S, the system shall keep for each user key every version with seq > S plus the newest version with seq <= S, and drop all older versions. | TEST-CMP-004 |
| REQ-CMP-005 | Where bottommost is true, the system shall drop a tombstone that is the newest version with seq <= S (nothing lies beneath it); a tombstone with seq > S shall be kept. | TEST-CMP-005 |
| REQ-CMP-006 | Where bottommost is false, the system shall keep all tombstones that survive the version rule. | TEST-CMP-006 |
| REQ-CMP-007 | The compaction output files shall each be valid SSTables whose entries are strictly ordered, and when concatenated equal the retained entries. | TEST-CMP-007 |
| REQ-CMP-008 | For every snapshot >= S and every key, reads over the compacted output shall equal reads over the inputs (a bottommost output may report NotFound where the input reported Deleted). | TEST-CMP-008 |
| REQ-CMP-009 | The stats shall satisfy input_entries = output_entries + dropped_versions + dropped_tombstones, with input_entries counting deduplicated merged entries. | TEST-CMP-009 |
| REQ-CMP-010 | The system shall treat key ranges as inclusive: overlaps(a,b) is true iff a.min <= b.max and b.min <= a.max, and pick_overlapping(files, lo, hi) shall return exactly the overlapping files in input order. | TEST-CMP-010 |
| REQ-CMP-011 | The level picker shall score L0 as files/trigger and level i>=1 as bytes/(base*multiplier^(i-1)), choose the highest score >= 1 (lowest level on ties), never choose the last level, and return -1 when nothing is due. | TEST-CMP-011 |
| REQ-CMP-012 | When an output file reaches target_file_size, the system shall roll to a new file only at a user-key boundary, so output files have pairwise disjoint key ranges and versions of one key are never split. | TEST-CMP-012 |

## Design
Components: `compaction.hpp` with `template <class Cursor> MergeIterator`, `VectorCursor`, `compact<Cursor>()`, `FileMeta`, `overlaps/pick_overlapping`, `pick_compaction_level`. SstIterator and VectorCursor both model `Cursor` (valid/entry/next). Data flow: cursors (newest first) -> MergeIterator (dedupe) -> version filter per user key -> SstWriter(s).

| Per-user-key filter state | Next version v | Action |
| --- | --- | --- |
| nothing kept yet | v.seq > S | keep |
| nothing kept yet | v.seq <= S, Put | keep, mark base |
| nothing kept yet | v.seq <= S, Delete, bottommost | drop (dropped_tombstones), mark base |
| nothing kept yet | v.seq <= S, Delete, not bottommost | keep, mark base |
| base marked | any older v | drop (dropped_versions) |

| Invariant | Reason |
| --- | --- |
| I1 output files disjoint by user key | levels >= 1 must not overlap |
| I2 reads at snapshots >= S unchanged | snapshot isolation |
| I3 input = output + dropped | stats accounting |

## Assumptions / risks
The k-way merge starts as a linear scan of cursors; heap is a later refactor guarded by TEST-CMP-001..003/008.
