---
feature: db
tier: T2
approval: auto
---
# db
Goal: a single-threaded LSM key-value engine tying together memtable, SSTables, Bloom filters and compaction: put/get/delete, write batches, RAII snapshots, leveled compaction, range scans, and crash-safe SSTable persistence via an RAII scoped file. Non-goals: WAL/recovery, concurrency, manifest, compression.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DB-001 | When put/del/get are called, the system shall return the latest value, nullopt for deleted or never-written keys, and overwrite on repeated puts. | TEST-DB-001 |
| REQ-DB-002 | The system shall give every written operation the next sequence number; a batch of n operations shall consume n consecutive sequence numbers. | TEST-DB-002 |
| REQ-DB-003 | When a Snapshot is created it shall register its sequence; when destroyed it shall unregister; moving a Snapshot shall transfer the registration (moved-from objects release nothing); oldest_snapshot() shall be the minimum live snapshot or last_seq() when none. | TEST-DB-003 |
| REQ-DB-004 | When the active memtable's approximate_bytes reaches memtable_bytes after a write, the system shall flush it to a new newest-first L0 file and install an empty memtable; empty memtables are never flushed. | TEST-DB-004 |
| REQ-DB-005 | The read path shall consult memtable, then L0 newest to oldest, then L1..Ln, and the first Found or Deleted result wins, so a tombstone hides older values below it. | TEST-DB-005 |
| REQ-DB-006 | When the level picker selects a level, the system shall compact it into the next level with its overlapping files, keeping L1+ levels sorted and pairwise non-overlapping (check_invariants), and L0 below its trigger afterwards. | TEST-DB-006 |
| REQ-DB-007 | While a snapshot is live, get(key, snapshot) shall return the value as of that snapshot even after flushes and compactions. | TEST-DB-007 |
| REQ-DB-008 | When compact_all() runs with no live snapshots, shadowed versions and tombstones shall be removed (an all-deleted database holds 0 entries); live snapshots shall retain the versions they need. | TEST-DB-008 |
| REQ-DB-009 | When scan(lo, hi) is called, the system shall return live key/value pairs with lo <= key < hi in ascending order across memtable and all levels, honouring an optional snapshot and excluding tombstones. | TEST-DB-009 |
| REQ-DB-010 | If any operation in a WriteBatch has a key longer than 1024 bytes, then write() shall throw std::invalid_argument and apply nothing (sequence unchanged). | TEST-DB-010 |
| REQ-DB-011 | When a ScopedFile is committed it shall rename its temporary file to the final path; if destroyed uncommitted it shall delete the temporary file and leave no final file; moves shall transfer ownership. | TEST-DB-011 |
| REQ-DB-012 | When save(dir) is called, the system shall write each SSTable through a ScopedFile as L<level>-<id>.sst, leave no .tmp files, and each saved file shall load back identical. | TEST-DB-012 |
| REQ-DB-013 | The stats accessors shall report per-level file counts and byte sizes consistent with the files held, and total_entries() equal to the sum of file entry counts. | TEST-DB-013 |
| REQ-DB-014 | Where DbOptions::l0_trigger is set, the system shall use it as the L0 compaction trigger (bug fix: it was ignored in favour of levels.l0_trigger). | TEST-DB-014 |
| REQ-DB-015 | If a Snapshot that belongs to another Db (or was moved from) is passed to get or scan, then the system shall throw std::invalid_argument (bug fix: it silently read at the foreign sequence). | TEST-DB-015 |

## Design
Components: `db.hpp` (Db, DbOptions, Snapshot, WriteBatch), `raii.hpp` (ScopedFile). Db owns `std::unique_ptr<MemTable>` plus `levels_` (vector of vector<shared_ptr<SstFile>>; L0 newest first, L1+ sorted by min_key). Flush and compaction are synchronous inside write().

| Event | State change |
| --- | --- |
| write (valid) | seq += n; memtable insert; if bytes >= threshold -> flush |
| write (invalid key) | none (validated first) |
| flush | memtable -> L0 front; new memtable; maybe_compact |
| maybe_compact | loop pick_compaction_level -> compact_level until -1 |
| compact_level(L) | inputs = (L0: all; else first file) + overlapping files of L+1; outputs replace overlapping files of L+1 sorted by min_key; bottommost iff no deeper overlapping file |
| Snapshot create/destroy/move | multiset insert / erase / pointer steal |

| Invariant | Enforced by |
| --- | --- |
| I1 L1+ files sorted, disjoint | outputs of one compaction are disjoint (CMP-012), inserted in place of overlapped files |
| I2 newer layers hold newer seqs | flush puts newest first; compaction inputs ordered newest first |
| I3 tombstone dropped only when nothing deeper overlaps and seq <= oldest snapshot | bottommost computation + compaction rule |
| I4 ScopedFile never leaves a .tmp after destruction | destructor removes uncommitted tmp |

## Assumptions / risks
Bottommost detection must look at all deeper levels, not just the target level; retired by TEST-DB-005/008 (tombstone vs deep value). Persisting uses std::filesystem relative to the test working directory.
