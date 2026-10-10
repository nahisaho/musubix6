---
feature: wal
tier: T2
---
# wal
Goal: append-only write-ahead log with CRC frames, simulated crashes and recovery that replays only committed transactions. Non-goals: log rotation.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-WAL-001 | When a record is appended, the system shall assign strictly increasing LSNs starting at 1. | TEST-WAL-001 |
| REQ-WAL-002 | When records are appended and synced, recover shall return the same records in order. | TEST-WAL-002 |
| REQ-WAL-003 | While data is appended but not synced, a crash shall lose exactly the unsynced bytes. | TEST-WAL-003 |
| REQ-WAL-004 | If the log ends with a torn frame, then recover shall stop at the last valid frame and report valid_len. | TEST-WAL-004 |
| REQ-WAL-005 | If a frame payload byte is corrupted, then recover shall stop before that frame and ignore all later frames. | TEST-WAL-005 |
| REQ-WAL-006 | When the log is replayed, the system shall return only operations of committed transactions in commit order. | TEST-WAL-006 |
| REQ-WAL-007 | If a transaction has an Abort record or no Commit record, then replay shall omit its operations. | TEST-WAL-007 |
| REQ-WAL-008 | When a Checkpoint record exists, replay shall omit transactions committed at or before the checkpoint LSN. | TEST-WAL-008 |
| REQ-WAL-009 | When Wal::open is called on a log with a torn tail, the system shall truncate the tail so new appends follow the last valid frame. | TEST-WAL-009 |

## Design
Frame: `[len u32 LE][crc u32 LE][lsn u64 LE][payload]`, crc32 over lsn+payload, len = payload length. `SimDisk{durable, buffer}`: write appends to buffer, sync moves buffer to durable, crash drops buffer (optionally keeping a torn prefix).

| Condition at frame start | Recovery action |
| --- | --- |
| fewer than 16 header bytes remain | stop, tail is torn |
| len exceeds remaining bytes | stop, tail is torn |
| crc mismatch | stop, ignore the rest |
| lsn not previous+1 (first frame must carry lsn 1) | stop, treat as corruption |
| valid | decode record, continue |

Invariants: valid_len is a frame boundary; open() leaves durable.len() == valid_len; LSNs are contiguous.

## Assumptions / risks
Torn-write at every byte offset must recover (exhaustive loop in TEST-WAL-004).
