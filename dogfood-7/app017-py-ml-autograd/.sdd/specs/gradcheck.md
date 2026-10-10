---
feature: gradcheck
tier: T2
approval: auto
---
# gradcheck
Goal: Reliable numerical gradcheck. Non-goals: GPUs and higher derivatives.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-GRADCHECK-001 | When scalar polynomial graphs are checked, analytic gradients shall match finite differences. | TEST-GRADCHECK-001 |
| REQ-GRADCHECK-002 | When broadcast graphs are checked, all operand gradients shall match finite differences. | TEST-GRADCHECK-002 |
| REQ-GRADCHECK-003 | When matrix graphs are checked, both Jacobian products shall match finite differences. | TEST-GRADCHECK-003 |
| REQ-GRADCHECK-004 | When seeded random smooth graphs are checked repeatedly, gradients shall match finite differences. | TEST-GRADCHECK-004 |
| REQ-GRADCHECK-005 | When graph gradients are wrong, the checker shall return false. | TEST-GRADCHECK-005 |
| REQ-GRADCHECK-006 | When a non-scalar output is supplied without a seed, the checker shall reject it. | TEST-GRADCHECK-006 |
| REQ-GRADCHECK-007 | When checker inputs are supplied, finite differences shall not mutate caller storage. | TEST-GRADCHECK-007 |
| REQ-GRADCHECK-008 | When reshape and transpose participate in gradients, finite differences shall agree. | TEST-GRADCHECK-008 |
| REQ-GRADCHECK-009 | When gradients or perturbed outputs are nonfinite, the checker shall return false rather than approve matching infinities; finite large derivatives shall remain checkable. | TEST-GRADCHECK-009 |
| REQ-GRADCHECK-010 | When equal finite outputs have a large constant offset, finite differences shall preserve a zero gradient without division overflow. | TEST-GRADCHECK-010 |

## Design
Float64 NumPy storage; reverse-topological VJPs compose through immutable graph edges.
Leaf gradients accumulate; optimizer and module state copy across ownership boundaries.
## Assumptions / risks
CPU only; spike verifies NumPy broadcast reduction and finite differences.
No higher derivatives or in-place graph mutation; training updates follow completed backward calls.
