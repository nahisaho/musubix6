---
feature: def
tier: T1
---
# def
Goal: Saga and step definitions with dependency-ordered execution. Non-goals: execution, persistence.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DEF-001 | When a step is added to a SagaDefinition, the system shall make it retrievable by name and list names in insertion order. | TEST-DEF-001 |
| REQ-DEF-002 | If a step or saga name is empty or has characters outside [A-Za-z0-9_.-], then the system shall throw InvalidArgumentException. | TEST-DEF-002 |
| REQ-DEF-003 | If a step with an existing name is added, then the system shall throw LogicException and keep the definition unchanged. | TEST-DEF-003 |
| REQ-DEF-004 | If a step depends on itself, then the system shall throw InvalidArgumentException. | TEST-DEF-004 |
| REQ-DEF-005 | When the execution order is requested, the system shall return a topological order where dependencies come first, ties broken by insertion order, and forward references allowed. | TEST-DEF-005 |
| REQ-DEF-006 | If a step depends on an unknown step, then the execution order request shall throw LogicException naming both steps. | TEST-DEF-006 |
| REQ-DEF-007 | If dependencies form a cycle, then the execution order request shall throw LogicException whose message contains "cycle" and the cycle path. | TEST-DEF-007 |
| REQ-DEF-008 | When the compensation order of completed steps is requested, the system shall return those steps in reverse execution order, and throw InvalidArgumentException for an unknown name. | TEST-DEF-008 |
| REQ-DEF-009 | When the fingerprint is requested, the system shall return a 64-hex digest independent of insertion order that changes when the saga name, step set or dependencies change. | TEST-DEF-009 |

## Assumptions / risks: Kahn's algorithm with a min-index ready set gives stable order (TEST-DEF-005); cycle path found by DFS (TEST-DEF-007).
