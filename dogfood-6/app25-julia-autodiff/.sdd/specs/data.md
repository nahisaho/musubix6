---
feature: data
tier: T1
---
# data
Goal: deterministic synthetic datasets and mini-batching. Depends on rng, tensor.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DATA-001 | When make_xor(rng, n) is called, the system shall return X (n x 2) and labels in 1:2 where label = 1 + (x1*x2 < 0 ? 1 : 0), with points at |x| in [0.2,1] to keep a margin. | TEST-DATA-001 |
| REQ-DATA-002 | When make_spirals(rng, n, k) is called, the system shall return n*k points over k classes with balanced labels and noise-controlled radius growth. | TEST-DATA-002 |
| REQ-DATA-003 | When the same seed is used twice, the system shall produce bit-identical datasets; different seeds shall differ. | TEST-DATA-003 |
| REQ-DATA-004 | When batch_indices(rng, n, bs) is called, the system shall return a shuffled partition of 1:n into chunks of size bs with a smaller final chunk and every index exactly once. | TEST-DATA-004 |
| REQ-DATA-005 | If bs < 1 or n < 1, then batch_indices shall throw ArgumentError. | TEST-DATA-005 |
| REQ-DATA-006 | When take_rows(X, idx) is called, the system shall return the rows of X in order idx as a new tensor, throwing BoundsError for out-of-range rows. | TEST-DATA-006 |
| REQ-DATA-007 | When train_test_split(rng, n, frac) is called, the system shall return disjoint index vectors covering 1:n with round(frac*n) test indices; frac outside (0,1) throws ArgumentError. | TEST-DATA-007 |
