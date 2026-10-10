---
feature: lu
tier: T2
---
# lu
Goal: LU factorization with partial pivoting and solve for sparse square systems. Non-goals: sparse fill-reducing orderings.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-LU-001 | When lu_factor(A) is called on a square CSR matrix, the system shall return a factorization with row permutation using partial pivoting. | TEST-LU-001 |
| REQ-LU-002 | When lu_solve(F,b) is called, the system shall return x with A*x ≈ b. | TEST-LU-002 |
| REQ-LU-003 | If a pivot has magnitude below 1e-12, then lu_factor shall throw SingularMatrixError. | TEST-LU-003 |
| REQ-LU-004 | If A is not square, then lu_factor shall throw DimensionMismatch. | TEST-LU-004 |
| REQ-LU-005 | If length(b) differs from the matrix order, then lu_solve shall throw DimensionMismatch. | TEST-LU-005 |
| REQ-LU-006 | When lu_det(F) is called, the system shall return the determinant including permutation sign. | TEST-LU-006 |
| REQ-LU-007 | When solve_checked(A,b;tol) is called and the residual norm exceeds tol, then the system shall throw ConvergenceError. | TEST-LU-007 |

## Design
Components: sparse.jl (CSR, matvec/to_dense) -> lu.jl (dense working copy, in-place Doolittle with partial pivoting; LUFactor{perm,sign,LU}).
Data flow: lu_factor(A) densifies via SparseOps.to_dense, factors, stores packed L\U and perm; lu_solve applies perm, forward then back substitution; solve_checked re-verifies using SparseOps.matvec.
Errors: SingularMatrixError(pivot_index), ConvergenceError(msg, residual); shapes use DimensionMismatch.
Decision: dense factors (sparse ordering out of scope); pivot threshold 1e-12 absolute.
## Assumptions / risks
Cross-feature: depends on sparse REQ-SPARSE-004/008. Julia include order in tests verified by TEST-LU-002.
