---
feature: dag
tier: T1
---
# dag
Goal: task graph with validation, cycle detection and deterministic topological scheduling. Non-goals: execution.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DAG-001 | When add_task(id, deps) is called, the system shall record the task and tasks() shall return ids in insertion order. | TEST-DAG-001 |
| REQ-DAG-002 | If add_task is called with an existing id, then the system shall raise DuplicateTask. | TEST-DAG-002 |
| REQ-DAG-003 | When validate() is called and a dependency id is not a task, the system shall raise UnknownDependency naming it. | TEST-DAG-003 |
| REQ-DAG-004 | When find_cycle() is called, the system shall return a list of task ids forming one cycle, with the first id repeated at the end, or None when the graph is acyclic. | TEST-DAG-004 |
| REQ-DAG-005 | When a task depends on itself, find_cycle() shall report it as a cycle [id, id]. | TEST-DAG-005 |
| REQ-DAG-006 | When topological_order() is called on an acyclic graph, the system shall return ids with dependencies first, ties broken by insertion order. | TEST-DAG-006 |
| REQ-DAG-007 | If topological_order() is called on a cyclic graph, then the system shall raise CycleError carrying the cycle. | TEST-DAG-007 |
| REQ-DAG-008 | When layers() is called, the system shall return lists of ids that can run in parallel, each layer depending only on earlier layers. | TEST-DAG-008 |
| REQ-DAG-009 | When dependents(id) is called, the system shall return all transitive downstream task ids in topological order. | TEST-DAG-009 |
