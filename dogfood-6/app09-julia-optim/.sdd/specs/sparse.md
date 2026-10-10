---
feature: sparse
tier: T1
---
# sparse
Goal: CSR sparse matrix with basic ops. Non-goals: complex numbers, in-place ops.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SPARSE-001 | When from_triplets(n,m,I,J,V) is called, the system shall build a CSR matrix summing duplicate entries. | TEST-SPARSE-001 |
| REQ-SPARSE-002 | If any index is outside 1..n or 1..m, then the system shall throw BoundsError. | TEST-SPARSE-002 |
| REQ-SPARSE-003 | When nnz(A) is called, the system shall return the number of stored nonzero entries (explicit zeros dropped). | TEST-SPARSE-003 |
| REQ-SPARSE-004 | When matvec(A,x) is called, the system shall return the product A*x. | TEST-SPARSE-004 |
| REQ-SPARSE-005 | If length(x) differs from the column count, then matvec shall throw DimensionMismatch. | TEST-SPARSE-005 |
| REQ-SPARSE-006 | When transpose_csr(A) is called, the system shall return the CSR transpose. | TEST-SPARSE-006 |
| REQ-SPARSE-007 | When add(A,B) is called with equal shapes, the system shall return the elementwise sum; otherwise it shall throw DimensionMismatch. | TEST-SPARSE-007 |
| REQ-SPARSE-008 | When to_dense(A) is called, the system shall return the equivalent dense Matrix. | TEST-SPARSE-008 |
