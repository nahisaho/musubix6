---
feature: bytecode
tier: T2
approval: auto
---
# Checked bytecode VM
Goal: deterministic bounded interpreter. Non-goals: JavaScript parsing and native machine code.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-BC-001 | When a program loads constants and returns, the VM shall return the register value. | TEST-BC-001 |
| REQ-BC-002 | When ADD SUB MUL LT MOV execute, the VM shall apply JavaScript numeric operations and copy semantics. | TEST-BC-002 |
| REQ-BC-003 | When JMP and JZ execute, the VM shall follow absolute targets and falsey branching. | TEST-BC-003 |
| REQ-BC-004 | If an opcode, register, target or operand is invalid, the validator shall reject before execution. | TEST-BC-004 |
| REQ-BC-005 | If a reachable instruction reads a register not initialized on every incoming path, the validator shall reject it. | TEST-BC-005 |
| REQ-BC-006 | When execution exceeds a positive instruction budget, the VM shall throw a budget error. | TEST-BC-006 |
| REQ-BC-007 | When GET and SET execute, the VM shall use the supplied property cache and return current values. | TEST-BC-007 |
| REQ-BC-008 | When invocations reuse a program, the VM shall isolate registers and leave bytecode unchanged. | TEST-BC-008 |
| REQ-BC-009 | When no cache is supplied, GET/SET shall use shape-object accessors only for branded shape objects and normal property semantics for ordinary objects. | TEST-BC-009 |
## Design
Instruction tuples use one schema; register counts are positive integers, arity is 0..registers, and indices are bounded integers.
CONST permits null/undefined/string/number/boolean/bigint only; GET/SET keys are strings and tuple arity is exact.
Validation checks structure then forward definite-assignment over the reachable CFG.
Interpreter registers are invocation-local; heap handles are not implicitly dereferenced.
## Assumptions / risks
Node ESM and node:test patterns are supported (spikes/runtime.js).
Inputs occupy registers 0..arity-1; jumps target instruction indices; finite budgets prevent infinite loops.
