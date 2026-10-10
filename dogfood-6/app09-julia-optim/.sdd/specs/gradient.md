---
feature: gradient
tier: T2
---
# gradient
Goal: Gradient descent with Armijo backtracking and convergence guarantee on smooth functions; quadratic helper on sparse SPD matrices.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-GRAD-001 | When gradient_descent(f,g,x0) is called, the system shall return a Result whose x has norm(g(x)) < tol on convergence. | TEST-GRAD-001 |
| REQ-GRAD-002 | While iterating, the system shall accept steps satisfying the Armijo condition so that f values are monotone nonincreasing. | TEST-GRAD-002 |
| REQ-GRAD-003 | When the gradient norm is below tol at x0, the system shall return status :converged with 0 iterations. | TEST-GRAD-003 |
| REQ-GRAD-004 | If max_iter is exhausted, then the system shall return status :max_iter. | TEST-GRAD-004 |
| REQ-GRAD-005 | If f or g yields a non-finite value, then the system shall throw DomainError. | TEST-GRAD-005 |
| REQ-GRAD-006 | If tol <= 0 or max_iter < 1, then the system shall throw ArgumentError. | TEST-GRAD-006 |
| REQ-GRAD-007 | When quadratic_problem(A,b) is called with a CSR matrix, the system shall return (f,g) for 0.5x'Ax - b'x using sparse matvec. | TEST-GRAD-007 |
| REQ-GRAD-008 | If no step satisfies the Armijo condition after 60 halvings, then the system shall return status :line_search_failed. | TEST-GRAD-008 |
| REQ-GRAD-009 | If an Armijo-accepted step leaves x or f(x) unchanged (no strict decrease, e.g. step underflow), then the system shall return status :line_search_failed instead of continuing. | TEST-GRAD-009 |

## Design
Components: gradient.jl; quadratic_problem uses SparseOps.matvec (cross-feature dependency on sparse).
Data flow: x -> g=grad(x) -> d=-g -> t halves from 1 until f(x+t d) <= f(x) - 1e-4 t |g|^2 -> x+=t d; history of f recorded in Result.
Status: converged | max_iter | line_search_failed. Guarantee: Armijo descent => monotone f, and for bounded-below smooth f, |g|->0.
Decision: non-finite is thrown (DomainError), not a status.
## Assumptions / risks
Convergence on an ill-conditioned quadratic needs many iterations; tests use well-conditioned problems.
