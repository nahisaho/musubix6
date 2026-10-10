---
feature: autograd
tier: T2
approval: auto
---
# autograd
Goal: Reliable numerical autograd. Non-goals: GPUs and higher derivatives.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-AUTOGRAD-001 | When backward follows a diamond graph, each edge shall contribute exactly once. | TEST-AUTOGRAD-001 |
| REQ-AUTOGRAD-002 | When backward follows broadcasting, gradients shall reduce to original shapes. | TEST-AUTOGRAD-002 |
| REQ-AUTOGRAD-003 | When backward is repeated, leaf gradients shall accumulate without stale intermediate gradients. | TEST-AUTOGRAD-003 |
| REQ-AUTOGRAD-004 | When explicit seeds are supplied, vector Jacobian products shall match them; unseeded vectors and mismatched seed shapes shall raise ValueError. | TEST-AUTOGRAD-004 |
| REQ-AUTOGRAD-005 | When exp and log compose, gradients shall satisfy the chain rule. | TEST-AUTOGRAD-005 |
| REQ-AUTOGRAD-006 | When ReLU is differentiated, nonpositive entries shall have zero gradient. | TEST-AUTOGRAD-006 |
| REQ-AUTOGRAD-007 | When matrix multiplication is differentiated, both matrix gradients shall be correct. | TEST-AUTOGRAD-007 |
| REQ-AUTOGRAD-008 | When mean uses negative or multiple axes, scaling shall count the reduced dimensions. | TEST-AUTOGRAD-008 |
| REQ-AUTOGRAD-009 | When zero-valued tensors are raised to the zeroth power, backward shall return finite zero gradients. | TEST-AUTOGRAD-009 |
| REQ-AUTOGRAD-010 | When transpose uses mixed positive and negative axes, backward shall apply the inverse permutation. | TEST-AUTOGRAD-010 |

## Design
Float64 NumPy storage; reverse-topological VJPs compose through immutable graph edges.
Leaf gradients accumulate; optimizer and module state copy across ownership boundaries.
## Assumptions / risks
CPU only; spike verifies NumPy broadcast reduction and finite differences.
No higher derivatives or in-place graph mutation; training updates follow completed backward calls.
