---
feature: schema
tier: T2
approval: auto
---
# schema
Goal: build an executable Schema from SDL and validate its invariants.   Non-goals: schema extension.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SCH-001 | When built from SDL, the schema shall register built-in scalars Int, Float, String, Boolean, ID and look up types by name, and validation shall reject a document that redefines a built-in scalar. | TEST-SCH-001 |
| REQ-SCH-002 | Where no `schema {}` block exists, the schema shall use types named Query/Mutation/Subscription as roots. | TEST-SCH-002 |
| REQ-SCH-003 | If no query root exists or the root is not an object type, then validation shall report an error. | TEST-SCH-003 |
| REQ-SCH-004 | If a field, argument or union member references an unknown type, then validation shall report "unknown type". | TEST-SCH-004 |
| REQ-SCH-005 | If an object does not implement every interface field with a covariant type and every interface argument, then validation shall report the violation. | TEST-SCH-005 |
| REQ-SCH-006 | If an interface implements itself transitively (cycle), then validation shall report a cycle. | TEST-SCH-006 |
| REQ-SCH-007 | If a union member is not an object type or the union is empty, then validation shall report an error. | TEST-SCH-007 |
| REQ-SCH-008 | If an argument or input field uses an output type, or an output field uses an input type, then validation shall report an error. | TEST-SCH-008 |
| REQ-SCH-009 | If a non-null input object field chain refers back to its own type without nullable or list break, then validation shall report an unbreakable input cycle. | TEST-SCH-009 |
| REQ-SCH-010 | When asked, the schema shall return possible object types of an abstract type and isSubType(abstract, object) shall agree with them. | TEST-SCH-010 |
| REQ-SCH-011 | If enum values duplicate, are empty, or are named true/false/null, then validation shall report an error. | TEST-SCH-011 |
| REQ-SCH-012 | If a default value does not fit its declared input type (kind, enum member, non-null), then validation shall report an error. | TEST-SCH-012 |

## Design
Components: `Schema\Schema` (type map, roots, possibleTypes), `Schema\SchemaBuilder` (Definition -> Schema), `Schema\Validator` (collects errors, never throws).
| Check | Input | Rule |
| --- | --- | --- |
| roots | roots map | query required, object |
| refs | all TypeRefs | named type exists |
| iface | object, interface | field superset, covariant, arg superset |
| iface-cycle | interface graph | DFS colouring, no back edge |
| input-cycle | non-null input fields | DFS over non-null non-list edges |
| defaults | input values | coerce against TypeRef |
Invariants: Validator is pure and returns all errors (not first); covariance: T! <: T, member <: abstract, [A] <: [B] if A <: B; built-in scalars cannot be redefined.
## Assumptions / risks: covariance rules retired by TEST-SCH-005.
