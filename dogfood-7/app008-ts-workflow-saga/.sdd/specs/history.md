---
feature: history
tier: T2
approval: auto
---
# Durable history
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-HISTORY-001 | When events are appended, the store shall preserve order and assign contiguous per-run sequences. | TEST-HISTORY-001 |
| REQ-HISTORY-002 | When reopened with an intact log, the store shall recover all fsynced events. | TEST-HISTORY-002 |
| REQ-HISTORY-003 | If the expected sequence is stale, the store shall reject without writing. | TEST-HISTORY-003 |
| REQ-HISTORY-004 | When two runs share a store, their sequences shall remain independent. | TEST-HISTORY-004 |
| REQ-HISTORY-005 | When input or returned events are mutated, persisted events shall remain unchanged. | TEST-HISTORY-005 |
| REQ-HISTORY-006 | If a persisted record is modified, the store shall reject the hash chain. | TEST-HISTORY-006 |
| REQ-HISTORY-007 | If a batch contains non-JSON data, the store shall reject the entire batch. | TEST-HISTORY-007 |
| REQ-HISTORY-008 | If a run identifier or event type is invalid, the store shall reject it. | TEST-HISTORY-008 |
| REQ-HISTORY-009 | While a run lease is held, a competing executor shall be rejected, and release shall restore access. | TEST-HISTORY-009 |
| REQ-HISTORY-010 | If an append lock is held, an append shall fail without changing history. | TEST-HISTORY-010 |
## Design
One fsynced JSONL file, global SHA-256 chain, contiguous per-run sequence; reads validate every record.
Append uses an exclusive directory lock and CAS; executor leases are per-run exclusive directories across processes.
Failures after a write/fsync may have uncertain commit: callers reread; malformed/truncated logs fail closed.
An interrupted final append makes the store unavailable, including its durable prefix, until operator recovery.
## Assumptions
Node 24 strips TypeScript; local filesystem supports exclusive mkdir and fsync (spike).
Durability targets local POSIX storage; crash-orphaned leases require operator inspection, never automatic unsafe eviction.
