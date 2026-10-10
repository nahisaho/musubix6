---
feature: wal
tier: T2
approval: auto
---
# wal
Goal: persistent MVCC LSM KV storage. Non-goals: distributed replication, disk encryption.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-WAL-001 | When appending a record and reopening, the system shall recover that record. | TEST-WAL-001 |
| REQ-WAL-002 | When recovering multiple records, the system shall preserve append order. | TEST-WAL-002 |
| REQ-WAL-003 | When a final frame is torn, the system shall recover only complete prior frames. | TEST-WAL-003 |
| REQ-WAL-004 | When a complete frame has a bad checksum, the system shall return an error. | TEST-WAL-004 |
| REQ-WAL-005 | When replaying a tombstone, the system shall preserve its deletion marker. | TEST-WAL-005 |
| REQ-WAL-006 | When append returns success, the system shall have synced the frame to disk. | TEST-WAL-006 |
| REQ-WAL-007 | When opening an empty log, the system shall recover zero records. | TEST-WAL-007 |
| REQ-WAL-008 | When appending after close, the system shall return an error without panicking. | TEST-WAL-008 |
| REQ-WAL-009 (deferred) | When configuring replication, the system shall copy the log to a remote peer. | — |
| REQ-WAL-010 | When appending after recovering an incomplete tail, the system shall truncate that tail and recover the newly appended frame on another reopen. | TEST-WAL-010 |
| REQ-WAL-011 | If a frame write or sync fails, the system shall reject all further appends on that handle until close and reopen reconcile the log. | TEST-WAL-011 |

## Design
Package `wal` owns this contract; all versions carry key, sequence, value, and tombstone.
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
