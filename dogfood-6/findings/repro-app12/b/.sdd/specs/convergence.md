---
feature: convergence
tier: T1
approval: auto
---
# convergence
Goal: randomized property harness proving merge laws and eventual convergence of stores. Non-goals: model checking.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CONVERGENCE-001 | When check_laws(kind, seed) is called for each built-in kind, the system shall return no violations of commutativity, associativity or idempotence. | TEST-CONVERGENCE-001 |
| REQ-CONVERGENCE-002 | When check_laws is given a broken merge function, the system shall report at least one violation. | TEST-CONVERGENCE-002 |
| REQ-CONVERGENCE-003 | When run_convergence(kind, seed) is called, the system shall report converged for every kind over seeds 0 to 19. | TEST-CONVERGENCE-003 |
| REQ-CONVERGENCE-004 | When run_convergence is called twice with the same kind and seed, the system shall return identical reports. | TEST-CONVERGENCE-004 |
| REQ-CONVERGENCE-005 | When run_partition(kind, seed) is called, the system shall report divergence during the partition and convergence after heal. | TEST-CONVERGENCE-005 |
| REQ-CONVERGENCE-006 | When a converged store receives a replayed copy of any remote state, the system shall keep the digest unchanged. | TEST-CONVERGENCE-006 |
| REQ-CONVERGENCE-007 | When counter kinds converge, the system shall report a value equal to the total of all applied operations. | TEST-CONVERGENCE-007 |
