---
feature: model
tier: T2
approval: auto
---
# Model contract
Goal: Declarative, typed, inherited SQLite models. Non-goals: composite primary keys.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-MODEL-001 | When a class declares fields, the system shall preserve declaration order. | TEST-MODEL-001 |
| REQ-MODEL-002 | When a model inherits fields, the system shall merge them without mutating the base. | TEST-MODEL-002 |
| REQ-MODEL-003 | When a default is callable, the system shall call it once per instance. | TEST-MODEL-003 |
| REQ-MODEL-004 | When a non-null field receives None, the system shall raise ValueError. | TEST-MODEL-004 |
| REQ-MODEL-005 | When a field receives the wrong type, the system shall raise TypeError and reject bool as int. | TEST-MODEL-005 |
| REQ-MODEL-006 | When constructor keys are unknown, the system shall raise TypeError. | TEST-MODEL-006 |
| REQ-MODEL-007 | When multiple primary keys are declared, the system shall reject the model. | TEST-MODEL-007 |
| REQ-MODEL-008 | When a model is serialized, the system shall return an independent field dictionary. | TEST-MODEL-008 |
| REQ-MODEL-009 | When multiple bases conflict, the system shall resolve field metadata and defaults consistently with Python MRO. | TEST-MODEL-009 |
## Design
Field descriptors enforce values; ModelMeta copies ordered inherited metadata.
One nullable integer primary key represents unsaved instances; SQL identifiers are validated.
## Assumptions / risks
SQLite accepts bound parameters and transactional DDL; spikes/runtime.py verifies both.
Callable defaults return compatible values; models cannot implicitly persist themselves.
