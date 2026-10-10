---
feature: newton
tier: T2
---
# newton
Goal: Newton solver for F(x)=0 with sparse Jacobian and backtracking guarantee. Non-goals: trust regions.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-NEWTON-001 | When newton(F,J,x0) is called, the system shall return a Result whose x satisfies norm(F(x)) < tol on convergence. | TEST-NEWTON-001 |
| REQ-NEWTON-002 | The Result shall expose status, iterations, and residual norm. | TEST-NEWTON-002 |
| REQ-NEWTON-003 | When computing a step, the system shall solve J(x)d = -F(x) using lu_solve on the sparse Jacobian. | TEST-NEWTON-003 |
| REQ-NEWTON-004 | If the Jacobian is singular, then newton shall return status :singular without throwing. | TEST-NEWTON-004 |
| REQ-NEWTON-005 | If max_iter is exhausted, then newton shall return status :max_iter. | TEST-NEWTON-005 |
| REQ-NEWTON-006 | If F returns a non-finite value, then newton shall throw DomainError. | TEST-NEWTON-006 |
| REQ-NEWTON-007 | While iterating, the system shall accept a step only if the residual norm decreases (backtracking), so the residual history is monotone nonincreasing. | TEST-NEWTON-007 |
| REQ-NEWTON-008 | If tol <= 0 or max_iter < 1, then newton shall throw ArgumentError. | TEST-NEWTON-008 |

## Design
Components: newton.jl uses LU (lu_factor/lu_solve), SparseOps (CSR Jacobian), and a Result struct.
Data flow: loop: r=F(x); check finite; if norm<tol -> :converged; J=J(x) (CSR); factor (SingularMatrixError -> :singular); d=solve; halve t up to 30 times until norm(F(x+t d)) < norm(r); else :stalled.
State table: converged | singular | max_iter | stalled; invalid args throw before iterating.
Decision: singularity is a status (expected numerical outcome), non-finite is an exception (programmer/domain error).
## Assumptions / risks
Backtracking guarantee is validated by the monotone history test (TEST-NEWTON-007).
