---
feature: sst
tier: T2
approval: auto
---
# sst
Goal: persistent MVCC LSM KV storage. Non-goals: distributed replication, disk encryption.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SST-001 | When a table is written and reopened, the system shall preserve all versions. | TEST-SST-001 |
| REQ-SST-002 | When querying a present key, the bloom filter shall never reject it. | TEST-SST-002 |
| REQ-SST-003 | When querying absent keys, the bloom filter shall reject at least 80 percent of a fixed sample. | TEST-SST-003 |
| REQ-SST-004 | When reading a corrupted table, the system shall return a checksum error. | TEST-SST-004 |
| REQ-SST-005 | When writing unsorted records, the system shall normalize key and descending sequence order. | TEST-SST-005 |
| REQ-SST-006 | When reading a tombstone record, the system shall preserve its deletion marker. | TEST-SST-006 |
| REQ-SST-007 | When querying an older snapshot, the system shall select an older visible version. | TEST-SST-007 |
| REQ-SST-008 | When writing an empty table, the system shall reopen it with zero records. | TEST-SST-008 |

## Design
Package `sstable` owns this contract; all versions carry key, sequence, value, and tombstone.
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
