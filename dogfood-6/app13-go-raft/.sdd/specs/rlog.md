---
feature: rlog
tier: T1
---
# rlog
Goal: 1-indexed Raft log with term-checked merge. Non-goals: persistence, snapshots.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-RLOG-001 | When a log is empty, the system shall report LastIndex()==0 and LastTerm()==0. | TEST-RLOG-001 |
| REQ-RLOG-002 | When Append(term,cmd) is called, the system shall return the new 1-based index and update LastIndex/LastTerm. | TEST-RLOG-002 |
| REQ-RLOG-003 | When Term(i) is called, the system shall return (0,true) for i==0, the entry term for 1<=i<=LastIndex, and (0,false) beyond. | TEST-RLOG-003 |
| REQ-RLOG-004 | When Match(prevIdx,prevTerm) is called, the system shall return true for (0,0) and for an existing entry with that term, else false. | TEST-RLOG-004 |
| REQ-RLOG-005 | When Merge(prevIdx,entries) is called and Match passes, the system shall append entries that follow the log end and return true with the new last index. | TEST-RLOG-005 |
| REQ-RLOG-006 | When a merged entry conflicts in term with an existing entry, the system shall truncate from the conflict and take the leader suffix. | TEST-RLOG-006 |
| REQ-RLOG-007 | When merged entries all match existing ones, the system shall not truncate (a stale shorter duplicate keeps a longer log intact). | TEST-RLOG-007 |
| REQ-RLOG-008 | If Merge's prev entry does not match, then the system shall return false and leave the log unchanged. | TEST-RLOG-008 |
| REQ-RLOG-009 | When UpToDate(lastTerm,lastIdx) is called, the system shall return true iff lastTerm is higher, or equal with lastIdx >= own LastIndex. | TEST-RLOG-009 |
| REQ-RLOG-010 | When Slice(from,max) is called, the system shall return a copy of up to max entries starting at from, or empty if from is out of range. | TEST-RLOG-010 |
