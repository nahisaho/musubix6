---
feature: tensor
tier: T2
approval: auto
---
# tensor
Goal: Reliable numerical tensor. Non-goals: GPUs and higher derivatives.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-TENSOR-001 | Construction shall copy input data into floating storage. | TEST-TENSOR-001 |
| REQ-TENSOR-002 | When scalar addition is called, broadcasting shall preserve shape and values. | TEST-TENSOR-002 |
| REQ-TENSOR-003 | When two tensors multiply, singleton dimensions shall broadcast. | TEST-TENSOR-003 |
| REQ-TENSOR-004 | When subtraction or negation is called, values shall match arithmetic. | TEST-TENSOR-004 |
| REQ-TENSOR-005 | When division is called, reflected and ordinary division shall agree with arithmetic. | TEST-TENSOR-005 |
| REQ-TENSOR-006 | When incompatible shapes are combined, the system shall raise ValueError. | TEST-TENSOR-006 |
| REQ-TENSOR-007 | When reductions specify axes and keepdims, the system shall preserve requested dimensions. | TEST-TENSOR-007 |
| REQ-TENSOR-008 | When reshape and transpose are called, shape and ordering shall match NumPy. | TEST-TENSOR-008 |
| REQ-TENSOR-009 | When a one-element tensor is reshaped to the empty shape tuple, the system shall return a scalar and preserve backward gradients. | TEST-TENSOR-009 |

## Design
Float64 NumPy storage; reverse-topological VJPs compose through immutable graph edges.
Leaf gradients accumulate; optimizer and module state copy across ownership boundaries.
## Assumptions / risks
CPU only; spike verifies NumPy broadcast reduction and finite differences.
No higher derivatives or in-place graph mutation; training updates follow completed backward calls.
