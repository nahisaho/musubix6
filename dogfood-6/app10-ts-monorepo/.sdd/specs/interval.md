---
feature: interval
tier: T1
---
# interval
Goal: half-open interval algebra on epoch ms.   Non-goals: time zones.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-INTERVAL-001 | If makeInterval(start,end) has non-finite values or end<=start, then the system shall throw RangeError, else return {start,end}. | TEST-INTERVAL-001 |
| REQ-INTERVAL-002 | When overlaps(a,b) is called, the system shall return true iff a.start<b.end and b.start<a.end (adjacent intervals do not overlap). | TEST-INTERVAL-002 |
| REQ-INTERVAL-003 | When mergeIntervals(list) is called, the system shall return sorted intervals where overlapping or touching ones are merged, without mutating the input. | TEST-INTERVAL-003 |
| REQ-INTERVAL-004 | When subtractIntervals(base,busy) is called, the system shall return the sorted free gaps of base not covered by busy. | TEST-INTERVAL-004 |
| REQ-INTERVAL-005 | When contains(outer,inner) is called, the system shall return true iff outer.start<=inner.start and inner.end<=outer.end. | TEST-INTERVAL-005 |
| REQ-INTERVAL-006 | When durationMinutes(i) is called, the system shall return (end-start)/60000. | TEST-INTERVAL-006 |
| REQ-INTERVAL-007 | When mergeIntervals gets an interval fully nested in an earlier one, the system shall keep the outer end (bug fix). | TEST-INTERVAL-007 |
