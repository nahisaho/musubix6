---
feature: mem
tier: T2
approval: auto
---
# mem
Goal: persistent MVCC LSM KV storage. Non-goals: distributed replication, disk encryption.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-MEM-001 | When a version is inserted, the system shall retrieve its value at that sequence. | TEST-MEM-001 |
| REQ-MEM-002 | When a later version is inserted, the system shall preserve the earlier snapshot value. | TEST-MEM-002 |
| REQ-MEM-003 | When a tombstone is visible, the system shall report the key absent. | TEST-MEM-003 |
| REQ-MEM-004 | When scanning a range, the system shall return keys sorted with start inclusive and end exclusive. | TEST-MEM-004 |
| REQ-MEM-005 | When reading before the first version, the system shall report the key absent. | TEST-MEM-005 |
| REQ-MEM-006 | When callers mutate input or returned bytes, the system shall preserve stored bytes. | TEST-MEM-006 |
| REQ-MEM-007 | When versions arrive out of sequence, the system shall choose the largest visible sequence. | TEST-MEM-007 |
| REQ-MEM-008 | When concurrent writers insert distinct keys, the system shall retain every distinct key. | TEST-MEM-008 |
| REQ-MEM-009 | When serializing and deserializing records, the system shall preserve arbitrary key bytes, value bytes, sequence, and tombstone without UTF-8 replacement. | TEST-MEM-010 |

## Design
Package `memtable` owns this contract; all versions carry key, sequence, value, and tombstone.
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
