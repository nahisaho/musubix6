---
feature: tiering
tier: T2
approval: auto
---
# Tiered optimizer
Goal: profile, optimize and safely deopt. Non-goals: native JIT or JavaScript source.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-OPT-001 | When an engine registers a function, it shall begin cold and execute validated bytecode. | TEST-OPT-001 |
| REQ-OPT-002 | When invocation thresholds are met, cold functions shall become baseline then optimized. | TEST-OPT-002 |
| REQ-OPT-003 | When pure constant arithmetic is optimized, the optimizer shall fold it without changing results. | TEST-OPT-003 |
| REQ-OPT-004 | When an argument type violates an optimized guard, execution shall deopt before effects and return baseline semantics. | TEST-OPT-004 |
| REQ-OPT-005 | When an object shape violates an optimized guard, execution shall deopt and safely read current properties. | TEST-OPT-005 |
| REQ-OPT-006 | When optimized code writes properties before reading, deoptimization shall not duplicate side effects. | TEST-OPT-006 |
| REQ-OPT-007 | When functions share an engine, profiles and cache sites shall remain isolated and explicit invalidation shall drop optimized code. | TEST-OPT-007 |
| REQ-OPT-008 | When engine execution uses heap handles and allocated registers, its result and GC roots shall match baseline semantics. | TEST-OPT-008 |
| REQ-OPT-009 | When instruction hooks collect while a handle is live in a VM register, the engine shall retain that handle through collection and release register roots after invocation. | TEST-OPT-009 |
| REQ-OPT-010 | When invocation arguments contain array holes, every tier shall treat each hole as undefined and preserve dense-array semantics through optimization and deoptimization. | TEST-OPT-010 |
## Design
Single lifecycle table controls cold→baseline→optimized and optimized→baseline on deopt/invalidate.
Entry type and shape guards run before any effect; generic interpreter handles guard failures.
Straight-line constant folding resets at branch boundaries; register allocation uses validated optimized code.
Heap GET/SET uses a handle adapter; entry handles are temporarily rooted, including during onInstruction hooks, and released in finally.
Instruction hooks lease handles in the current CFG live-in set from virtual or physical/spill storage, releasing them in finally.
Invocation arguments are copied into a dense array before guard construction and register initialization.
## Assumptions / risks
Calls are synchronous; no on-stack replacement. Heap arguments are rooted for the whole invocation.
Optimization thresholds are positive ordered integers; definitions snapshot program tuples.
