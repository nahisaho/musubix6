---
feature: compact
tier: T2
approval: auto
---
# compact
Goal: persistent MVCC LSM KV storage. Non-goals: distributed replication, disk encryption.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-COMPACT-001 | When merging overlapping versions, the system shall retain every unique key-sequence pair. | TEST-COMPACT-001 |
| REQ-COMPACT-002 | When merging tombstones, the system shall preserve snapshots before and after deletion. | TEST-COMPACT-002 |
| REQ-COMPACT-003 | When selecting size-tiered compaction, the system shall select similarly sized tables meeting fan-in. | TEST-COMPACT-003 |
| REQ-COMPACT-004 | When selecting leveled compaction, the system shall include key-overlapping next-level tables. | TEST-COMPACT-004 |
| REQ-COMPACT-005 | When fewer than fan-in size-tiered tables exist, the system shall schedule no work. | TEST-COMPACT-005 |
| REQ-COMPACT-006 | When merging duplicate key-sequence records, the system shall retain the first source record. | TEST-COMPACT-006 |
| REQ-COMPACT-007 | When compacting the database, the system shall preserve an active snapshot and current values. | TEST-COMPACT-007 |
| REQ-COMPACT-008 | When compaction input is empty, the system shall return an empty result. | TEST-COMPACT-008 |

## Design
Package `compact` owns this contract; all versions carry key, sequence, value, and tombstone.
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
