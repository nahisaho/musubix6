---
feature: layers
tier: T2
approval: auto
---
# layers
Goal: Reliable numerical layers. Non-goals: GPUs and higher derivatives.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-LAYERS-001 | When Linear evaluates batched input, affine output shall have expected values. | TEST-LAYERS-001 |
| REQ-LAYERS-002 | When module parameters are enumerated, shared tensors shall occur only once. | TEST-LAYERS-002 |
| REQ-LAYERS-003 | When Sequential runs, child modules shall compose in declaration order. | TEST-LAYERS-003 |
| REQ-LAYERS-004 | When MSE differentiates, the mean squared error gradient shall be correct. | TEST-LAYERS-004 |
| REQ-LAYERS-005 | When module state is restored, values shall copy without aliasing caller arrays. | TEST-LAYERS-005 |
| REQ-LAYERS-006 | When training mode changes, all descendants shall inherit it. | TEST-LAYERS-006 |
| REQ-LAYERS-007 (test-only) | When detach is called, storage shall copy and gradient history shall disconnect. | TEST-LAYERS-007 |
| REQ-LAYERS-008 | When deterministic SGD training runs, regression loss shall substantially decrease. | TEST-LAYERS-008 |
| REQ-LAYERS-009 | When a module contains scalar and vector parameters, valid state loading shall update both and invalid shapes shall leave both unchanged. | TEST-LAYERS-009 |

## Design
Float64 NumPy storage; reverse-topological VJPs compose through immutable graph edges.
Leaf gradients accumulate; optimizer and module state copy across ownership boundaries.
## Assumptions / risks
CPU only; spike verifies NumPy broadcast reduction and finite differences.
No higher derivatives or in-place graph mutation; training updates follow completed backward calls.
