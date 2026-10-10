---
feature: allocation
tier: T2
approval: auto
---
# Register allocation
Goal: executable allocation with spills. Non-goals: native ABI.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-RA-001 | When a bytecode program is analyzed, the allocator shall compute block-sensitive live-in and live-out sets. | TEST-RA-001 |
| REQ-RA-002 | When allocating disjoint lifetimes, the allocator shall reuse a physical register. | TEST-RA-002 |
| REQ-RA-003 | When values interfere, the allocator shall place them in distinct physical registers or spill slots. | TEST-RA-003 |
| REQ-RA-004 | If pressure exceeds the register budget, the allocator shall allocate distinct reusable spill slots. | TEST-RA-004 |
| REQ-RA-005 | When allocated code runs, the executor shall preserve original interpreter results. | TEST-RA-005 |
| REQ-RA-006 | When a backedge exists, liveness shall converge and allocated execution shall preserve loop state. | TEST-RA-006 |
| REQ-RA-007 | If the register budget is not a positive integer, the allocator shall reject it. | TEST-RA-007 |
| REQ-RA-008 | When assigning input registers, the allocator shall preserve concurrently required argument values. | TEST-RA-008 |
## Design
Backward fixed-point liveness feeds an interference graph, colored deterministically by degree.
Virtual registers map to physical registers or spill slots; execution accesses this map directly.
Interference includes live-in cliques to preserve simultaneously supplied arguments.
## Assumptions / risks
Operand uses/defs derive from the bytecode schema; loops require fixed-point analysis.
Whole-virtual-register allocation is conservative for reused definitions but always preserves semantics.
