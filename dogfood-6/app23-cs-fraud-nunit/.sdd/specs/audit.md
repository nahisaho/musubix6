---
feature: audit
tier: T2
---
# audit
Goal: tamper-evident, hash-chained audit trail.   Non-goals: signing, remote storage.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-AUD-001 | When an entry is appended, the AuditTrail shall assign Seq starting at 1 and Time from the injected clock. | TEST-AUD-001 |
| REQ-AUD-002 | The AuditTrail shall compute each entry hash as SHA-256 hex over the canonical encoding including the previous hash; the first PrevHash is 64 zeros. | TEST-AUD-002 |
| REQ-AUD-003 | The canonical encoding shall be length-prefixed so that field boundary shifts yield different hashes. | TEST-AUD-003 |
| REQ-AUD-004 | When Verify is called on an untampered chain, the AuditTrail shall return Ok. | TEST-AUD-004 |
| REQ-AUD-005 | If any entry content was altered, then Verify shall fail and report the first bad Seq. | TEST-AUD-005 |
| REQ-AUD-006 | If entries were removed or reordered, then Verify shall fail at the first position where Seq or PrevHash breaks. | TEST-AUD-006 |
| REQ-AUD-007 | When querying by subject, the AuditTrail shall return that subject's entries in Seq order. | TEST-AUD-007 |
| REQ-AUD-008 | The Entries view shall be a snapshot: mutating the returned list shall not change the trail. | TEST-AUD-008 |
| REQ-AUD-009 | When exported to JSON lines and imported again, the trail shall verify Ok and equal the original; importing malformed lines shall throw FormatException. | TEST-AUD-009 |

## Design
Components: AuditEntry (record), AuditTrail (append-only list + clock), AuditCodec (JSONL), VerifyResult.
Hash input = for each of Seq,Time(ISO "O"),Actor,Action,Subject,Detail,PrevHash: `<utf8 length>:<value>;`.

| State / field | Invariant |
| --- | --- |
| Seq | entries[i].Seq == i+1 (dense, increasing) |
| PrevHash | entries[0].PrevHash == 64x"0"; entries[i].PrevHash == entries[i-1].Hash |
| Hash | == SHA256hex(canonical(entry)); lowercase |
| Entries view | defensive copy; Append is the only mutator |
| Verify | returns first index violating any invariant above |

## Assumptions / risks: Time precision is preserved by round-trip "O" format (TEST-AUD-009).
