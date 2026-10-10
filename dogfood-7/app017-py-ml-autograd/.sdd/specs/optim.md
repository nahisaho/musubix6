---
feature: optim
tier: T2
approval: auto
---
# optim
Goal: Reliable numerical optim. Non-goals: GPUs and higher derivatives.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-OPTIM-001 | When SGD steps, gradients shall update parameters at the configured rate. | TEST-OPTIM-001 |
| REQ-OPTIM-002 | When momentum is enabled, successive SGD steps shall carry velocity. | TEST-OPTIM-002 |
| REQ-OPTIM-003 | When weight decay is configured, SGD shall include the parameter penalty. | TEST-OPTIM-003 |
| REQ-OPTIM-004 | When Adam first steps, bias correction shall yield the reference update. | TEST-OPTIM-004 |
| REQ-OPTIM-005 | When zero_grad is called, every owned gradient shall be cleared. | TEST-OPTIM-005 |
| REQ-OPTIM-006 | When a parameter has no gradient, optimizer steps shall leave it unchanged. | TEST-OPTIM-006 |
| REQ-OPTIM-007 | When an invalid learning rate or beta is supplied, construction shall reject it. | TEST-OPTIM-007 |
| REQ-OPTIM-008 | When optimizer state is round-tripped, independent copies shall resume identical updates. | TEST-OPTIM-008 |
| REQ-OPTIM-009 | When SGD state is restored, momentum and hyperparameters shall resume identically; invalid shapes shall be rejected without mutation. | TEST-OPTIM-009 |

## Design
Float64 NumPy storage; reverse-topological VJPs compose through immutable graph edges.
Leaf gradients accumulate; optimizer and module state copy across ownership boundaries.
## Assumptions / risks
CPU only; spike verifies NumPy broadcast reduction and finite differences.
No higher derivatives or in-place graph mutation; training updates follow completed backward calls.
