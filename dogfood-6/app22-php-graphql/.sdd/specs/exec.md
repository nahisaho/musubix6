---
feature: exec
tier: T2
approval: auto
---
# exec
Goal: execute a validated query against a Schema with resolvers.   Non-goals: subscriptions, async.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-EXE-001 | When a query is executed, the executor shall call resolvers with (source, args, context, info) and return `{data}` keyed by response key in document order. | TEST-EXE-001 |
| REQ-EXE-002 | Where no resolver exists for a field, the executor shall use the default resolver (array key, object property or getter). | TEST-EXE-002 |
| REQ-EXE-003 | When variables are supplied, the executor shall coerce them to declared types (Int from int, Float from int/float, ID from string/int, lists from scalars, defaults applied). | TEST-EXE-003 |
| REQ-EXE-004 | If a variable value is missing for a non-null type or has the wrong type, then the executor shall return errors and no data. | TEST-EXE-004 |
| REQ-EXE-005 | When `@skip(if:)` / `@include(if:)` are present, the executor shall omit the field accordingly (skip wins over include). | TEST-EXE-005 |
| REQ-EXE-006 | When fragments and inline fragments apply to the runtime type, the executor shall merge their fields, merging sub-selections of repeated response keys. | TEST-EXE-006 |
| REQ-EXE-007 | If a nullable field's resolver throws, then the executor shall set it to null and add an error with message and path. | TEST-EXE-007 |
| REQ-EXE-008 | If a non-null field resolves to null or throws, then the executor shall propagate null to the nearest nullable parent; if none, data is null. | TEST-EXE-008 |
| REQ-EXE-009 | When a list field is resolved, the executor shall complete each item; a null item in a `[T!]` list nulls the whole list (propagation) and errors carry the index in the path. | TEST-EXE-009 |
| REQ-EXE-010 | When a field has an interface or union type, the executor shall use resolveType (or `__typename` / isTypeOf) and report an error if the runtime type is not a possible type. | TEST-EXE-010 |
| REQ-EXE-011 | When enum and scalar leaf values are completed, the executor shall serialize them (enum must be a member; Int range 32-bit; Boolean strict) and report a field error otherwise. | TEST-EXE-011 |
| REQ-EXE-012 | When `__typename` is selected, the executor shall return the runtime object type name. | TEST-EXE-012 |
| REQ-EXE-013 | When a mutation operation is executed, the executor shall run its top-level fields serially in order, while query fields run in document order. | TEST-EXE-013 |
| REQ-EXE-014 | When several operations exist, the executor shall require an operationName and error if absent or unknown. | TEST-EXE-014 |
| REQ-EXE-015 | When arguments reference variables, the executor shall resolve nested variable literals in lists/objects and apply argument defaults. | TEST-EXE-015 |
| REQ-EXE-016 | If a variable value cannot be rendered as JSON (NaN, infinity, invalid UTF-8), then the executor shall still report the invalid-value error with a non-empty rendering of the value. | TEST-EXE-016 |

## Design
Components: `Exec\Executor` (collectFields, executeFields, completeValue), `Exec\Coercion` (variable/argument/leaf coercion), `Exec\FieldError` (path-carrying exception), `Exec\Result`.
| completeValue input | Type | Output |
| --- | --- | --- |
| null | nullable | null |
| null | non-null | FieldError -> propagate |
| array | list | each item recursively, index in path |
| value | enum/scalar | serialize or FieldError |
| value | abstract | resolveType then object |
| value | object | executeFields on collected sub-fields |
Invariants: errors list holds each error once, in encounter order; a propagated null never adds a second error for the same cause; data key order equals first-appearance in the collected fields; execution never throws for resolver failure.
## Assumptions / risks: propagation depth retired by TEST-EXE-008/009.
