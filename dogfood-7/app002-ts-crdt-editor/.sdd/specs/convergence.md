---
feature: convergence
tier: T2
approval: auto
---
# Adversarial convergence harness
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CONVERGENCE-001 | When a seeded PRNG is rerun, it shall produce the same bounded choices and operation schedule. | TEST-CONVERGENCE-001 |
| REQ-CONVERGENCE-002 | When insert-only replicas synchronize through shuffled duplicate delivery, every replica shall converge. | TEST-CONVERGENCE-002 |
| REQ-CONVERGENCE-003 | When randomized insertion/deletion edits synchronize, text, node order and operation logs shall converge. | TEST-CONVERGENCE-003 |
| REQ-CONVERGENCE-004 | When partitioned editors execute undo/redo, shuffled delivery shall converge with no pending operations. | TEST-CONVERGENCE-004 |
| REQ-CONVERGENCE-005 | When all delivery permutations of a small history are explored, causal clocks and visible text shall agree. | TEST-CONVERGENCE-005 |
| REQ-CONVERGENCE-006 | When anchors cross randomized schedules, resolved indexes shall be bounded and equal after convergence. | TEST-CONVERGENCE-006 |
| REQ-CONVERGENCE-007 | When a deep insert chain is materialized, the sequence shall avoid stack overflow and preserve text. | TEST-CONVERGENCE-007 |
| REQ-CONVERGENCE-008 (test-only) | When the node:test contract fixture is run, it shall characterize code-point versus UTF-16 indexing. | TEST-CONVERGENCE-008 |
## Design
Seeded xorshift32 drives pure Fisher-Yates schedules; simulator returns replicas, seed and delivered logs for reproduction.
Editor replicas are partitioned while editing, then every retained operation is shuffled and duplicated to each replica.
Properties compare canonical logs, traversal, text and pending sizes; small histories use exhaustive permutation enumeration.
## Assumptions
The scheduler does not drop messages permanently; eventual delivery is required. Fixed seeds bound test time.
PRNG zero seed normalizes to a nonzero seed. Unicode characterization is deliberately implementation-independent.
