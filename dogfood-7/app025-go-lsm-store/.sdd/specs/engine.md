---
feature: engine
tier: T2
approval: auto
---
# engine
Goal: persistent MVCC LSM KV storage. Non-goals: distributed replication, disk encryption.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ENGINE-001 | When putting a key and reading it, the system shall return the committed value. | TEST-ENGINE-001 |
| REQ-ENGINE-002 | When deleting a key, the system shall make current reads report it absent. | TEST-ENGINE-002 |
| REQ-ENGINE-003 | When a snapshot precedes a new write, the system shall retain its original value. | TEST-ENGINE-003 |
| REQ-ENGINE-004 | When flushing memory, the system shall continue serving values from the table. | TEST-ENGINE-004 |
| REQ-ENGINE-005 | When reopening the database, the system shall replay WAL records. | TEST-ENGINE-005 |
| REQ-ENGINE-006 | When iterating across memory and tables, the system shall deduplicate keys in sorted order. | TEST-ENGINE-006 |
| REQ-ENGINE-007 | When closing a database, the system shall reject subsequent writes. | TEST-ENGINE-007 |
| REQ-ENGINE-008 | When concurrent writes occur, the system shall assign distinct monotonically increasing sequences. | TEST-ENGINE-008 |
| REQ-ENGINE-009 | When reopening and writing after replay, the system shall allocate above the recovered high watermark and preserve the pre-write snapshot. | TEST-ENGINE-009 |

## Design
Package `store` owns this contract; all versions carry key, sequence, value, and tombstone.
Memory is mutex protected; store operations serialize commits; snapshots are immutable sequence cutoffs.
Tables are immutable JSON envelopes with SHA256 checksums and an in-memory reconstructed bloom filter.
WAL frames are length+CRC32+JSON; incomplete tail frames are ignored, complete corruption is rejected.
Reads and iterators choose the maximum sequence at or below the cutoff across every source, then suppress tombstones.
Recovery allocates sequences above the maximum in every recovered SST and WAL record.
Flush publishes SST sync/rename/directory-sync before manifest sync/rename/directory-sync; files are never deleted.
All versions are retained during compaction; no snapshot-expiring garbage collection is implemented.
## Assumptions / risks
Single process owns a directory; no cross-process locking. Maximum WAL frame is 16 MiB.
Atomic rename and sync are verified in `spikes/assumptions_test.go`; checksum and sequence probes run there.
Partial WAL tails must be truncated before further append; test this in the recovery bug-fix cycle.
