---
feature: tape
tier: T2
---
# tape
Goal: reverse-mode autodiff tape of Var nodes with a topological backward pass. Depends on tensor.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-TAPE-001 | When leaf(tape, t; requires_grad) is called, the system shall create a Var with a fresh id = length(nodes)+1 (monotone within an epoch, restarting at 1 after reset!), value t and grad == nothing. | TEST-TAPE-001 |
| REQ-TAPE-002 | When record!(tape, value, parents, backfn) is called, the system shall create a node whose requires_grad is true iff any parent requires grad (an empty or duplicated parent list is allowed) and whose parents all have smaller ids. | TEST-TAPE-002 |
| REQ-TAPE-003 | If a parent Var belongs to a different tape or an older epoch, then record! shall throw ArgumentError. | TEST-TAPE-003 |
| REQ-TAPE-004 | When backward!(tape, loss) is called on a scalar (numel==1) Var, the system shall seed d loss/d loss = 1 and propagate grads in descending id order to every ancestor that requires grad; the loss itself receives grad 1 and parents that do not require grad receive no gradient. | TEST-TAPE-004 |
| REQ-TAPE-005 | If loss is not scalar, then backward! shall throw ArgumentError; if loss does not require grad it shall throw ErrorException. | TEST-TAPE-005 |
| REQ-TAPE-006 | While a Var feeds several consumers, the system shall accumulate (sum) the incoming gradients (fan-out). | TEST-TAPE-006 |
| REQ-TAPE-007 | When backward! completes without retain=true, the system shall free the graph so that a second backward! and any further record! on the same tape throw ErrorException until reset!(tape); with retain=true leaf grads accumulate across calls while non-leaf grads are reset to nothing at the start of every call (only the loss is re-seeded). | TEST-TAPE-007 |
| REQ-TAPE-008 | When zero_grad!(tape) is called, the system shall set every leaf and node grad to nothing. | TEST-TAPE-008 |
| REQ-TAPE-009 | While no_grad(f, tape) runs, the system shall make record! return a detached Var (requires_grad=false, not on the tape); the previous mode is restored even when f throws. | TEST-TAPE-009 |
| REQ-TAPE-010 | When detach(v) is called, the system shall return a leaf copy of v.value with requires_grad=false and no parents. | TEST-TAPE-010 |
| REQ-TAPE-011 | When reset!(tape) is called, the system shall clear all nodes, bump the epoch, and reject Vars of the previous epoch in later record! calls. | TEST-TAPE-011 |
| REQ-TAPE-012 | The system shall give each node grad of the same shape as its value; a backward function shall return a vector with one tensor per parent, and a wrongly shaped entry (even for a parent not requiring grad) or wrong vector length shall raise DimensionMismatch. | TEST-TAPE-012 |
| REQ-TAPE-013 | When tape_of(v) is called, the system shall return the Tape that currently owns v (same uid and epoch) and nothing for detached Vars, stale-epoch Vars, and Vars created inside no_grad. | TEST-TAPE-013 |

## Design
Components: mutable Tape{nodes, epoch, grad_enabled, freed}, mutable Var{id, value, grad, requires_grad, parents, backfn, tape_id, epoch, tape} (tape = back-reference used by operators to find the owning tape, REQ-TAPE-013).
| state | transitions | invariant |
| --- | --- | --- |
| recording | record!/leaf (id = length(nodes)+1) | parents' ids < child id => descending id order is a valid reverse topological order |
| backwarded(freed) | backward!(retain=false) | backfns dropped; backward! again => ErrorException |
| recording(retained) | backward!(retain=true) | grads accumulate; graph kept |
| reset | reset! | epoch+1, nodes cleared; old Vars rejected |
| grad mode | no_grad(f, tape) toggles tape.grad_enabled | restored in finally |
Decisions: dense node vector instead of dict; accumulation by `+` into grad, no mutation of shared arrays (copy on first write).
## Assumptions / risks: id monotonicity makes a separate topological sort unnecessary (retired by TEST-TAPE-004 diamond graph).
