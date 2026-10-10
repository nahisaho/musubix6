---
feature: algebra
tier: T2
approval: auto
---
# Logical algebra
Goal: Typed bag-relational algebra and reference execution. Non-goals: SQL text parser, outer joins, aggregation.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ALG-001 | When constructing a scan, the system shall retain its table, alias and copied column schema. | TEST-ALG-001 |
| REQ-ALG-002 | When inspecting an expression, the system shall return sorted unique qualified references. | TEST-ALG-002 |
| REQ-ALG-003 | If an expression uses an unavailable column, the system shall reject the plan. | TEST-ALG-003 |
| REQ-ALG-004 | When projecting a plan, the system shall expose exactly the requested qualified columns. | TEST-ALG-004 |
| REQ-ALG-005 | If scans reuse an alias, the system shall reject the ambiguous plan. | TEST-ALG-005 |
| REQ-ALG-006 | When fingerprinting a plan, the system shall ignore object key insertion order. | TEST-ALG-006 |
| REQ-ALG-007 | When interpreting a plan, the system shall execute filters, inner joins and projections. | TEST-ALG-007 |
| REQ-ALG-008 | When interpreting a scan, the system shall preserve duplicate row multiplicity. | TEST-ALG-008 |
| REQ-ALG-009 (test-only) | When examining the public truth tables, the system shall expose all nine SQL three-valued AND and OR cells. | TEST-ALG-009 |
| REQ-ALG-010 | When a row field or table is absent as an own property, the system shall use NULL or report a missing table, never read prototype properties. | TEST-ALG-010 |
## Design
Discriminated unions model plans and scalar/boolean expressions; qualified names are the single column identity.
Validation traverses schemas before evaluation; canonical JSON provides immutable rewrite cycle keys.
## Assumptions / risks
Node 24 strips TypeScript with erasable syntax; workspace exports resolve source files (spikes/runtime.ts).
Rows are JSON scalars; bags preserve multiplicity; no outer joins or coercion; aliases cannot contain dots.
Operators: eq/ne/lt/le/gt/ge, AND/OR; comparison with NULL yields UNKNOWN; false AND UNKNOWN=false, true OR UNKNOWN=true; filters accept only true. Ordering compares like-typed numbers/strings only.
The commutative AND table is TT=T, TF=F, TU=U, FF=F, FU=F, UU=U; OR is TT=T, TF=T, TU=T, FF=F, FU=U, UU=U (U=NULL).
