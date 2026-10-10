---
feature: caches
tier: T2
approval: auto
---
# Shape-based inline caches
Goal: observable inline-cache transitions. Non-goals: prototypes and accessors.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-IC-001 | When objects receive the same ordered properties, the shape registry shall intern the same shape. | TEST-IC-001 |
| REQ-IC-002 | When a property is added or updated, objects shall preserve other values and transition shape only for additions. | TEST-IC-002 |
| REQ-IC-003 | When one site first reads an object, its cache shall transition empty to monomorphic and subsequently hit. | TEST-IC-003 |
| REQ-IC-004 | When a site observes up to its shape limit, it shall transition to polymorphic and serve each shape correctly. | TEST-IC-004 |
| REQ-IC-005 | When a site exceeds its shape limit, it shall become megamorphic and use generic lookup. | TEST-IC-005 |
| REQ-IC-006 | When an object changes shape, cached property reads shall miss safely and refresh their entry. | TEST-IC-006 |
| REQ-IC-007 | When a property is absent, the cache shall return undefined and observe subsequent additions. | TEST-IC-007 |
| REQ-IC-008 | If a cache limit or object/property argument is invalid, the subsystem shall reject without mutating state. | TEST-IC-008 |
## Design
Objects own shape descriptors and dense value slots; each registry interns ordered key lists.
Cache site identity is paired with a property; entries store shape identity and slot index.
State progression is empty→monomorphic→polymorphic→megamorphic; final state is absorbing.
## Assumptions / risks
Properties are string keys and have no prototype semantics; registry shapes compare by identity.
Different registries may allocate the same numeric shape ID; guard identity, not only the ID.
