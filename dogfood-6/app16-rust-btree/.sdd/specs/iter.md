---
feature: iter
tier: T1
---
# iter
Goal: snapshot-consistent forward/reverse range iterators over the MVCC store. Non-goals: write cursors.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ITER-001 | When scan is called with unbounded ends, the iterator shall yield every live key once in ascending order. | TEST-ITER-001 |
| REQ-ITER-002 | When scan is called with Included/Excluded bounds, the iterator shall honour each bound. | TEST-ITER-002 |
| REQ-ITER-003 | When scan is reversed, the iterator shall yield the same entries in descending order. | TEST-ITER-003 |
| REQ-ITER-004 | While a scan is at snapshot ts, it shall ignore versions committed later and yield one version per key. | TEST-ITER-004 |
| REQ-ITER-005 | When a key's newest visible version is a tombstone, the iterator shall skip that key. | TEST-ITER-005 |
| REQ-ITER-006 | If the lower bound is greater than the upper bound, then scan shall yield nothing. | TEST-ITER-006 |
| REQ-ITER-007 | When next and next_back are mixed on one iterator, the system shall yield each entry once and stop when they meet. | TEST-ITER-007 |
