---
feature: combinators
tier: T1
---
# combinators
Goal: a small parser-combinator core over `Source` offsets. Non-goals: streaming input, memoisation.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CMB-001 | When Pure(v) runs, the system shall succeed with v consuming nothing; Fail(msg) shall fail at the start offset. | TEST-CMB-001 |
| REQ-CMB-002 | When Satisfy(pred, name) runs, the system shall consume exactly one char on match, else fail at the same offset expecting {name} (also at end of input). | TEST-CMB-002 |
| REQ-CMB-003 | When Str(lit) runs, the system shall match atomically: on mismatch it fails at the start offset expecting "\"lit\"". | TEST-CMB-003 |
| REQ-CMB-004 | When Map(f) is applied, the system shall transform the value and keep the offset (LINQ Select too). | TEST-CMB-004 |
| REQ-CMB-005 | When Bind(f) is applied, the system shall run the parser f(value) at the next offset (LINQ query syntax works). | TEST-CMB-005 |
| REQ-CMB-006 | When Then/Left/Right sequence two parsers, the system shall return a tuple / only the left / only the right value. | TEST-CMB-006 |
| REQ-CMB-007 | When Or runs, the system shall return the first successful alternative (ordered choice) and backtrack to the start offset when an alternative fails. | TEST-CMB-007 |
| REQ-CMB-008 | When Many runs, the system shall collect zero or more items; if the item parser succeeds without consuming, it shall throw InvalidOperationException. | TEST-CMB-008 |
| REQ-CMB-009 | When Many1 / SepBy run, the system shall require one item / not consume a trailing separator that is not followed by an item. | TEST-CMB-009 |
| REQ-CMB-010 | When Opt(p, fallback) fails softly, the system shall return fallback consuming nothing; Between shall return only the middle value. | TEST-CMB-010 |
| REQ-CMB-011 | When ParseAll runs, the system shall fail expecting "end of input" at the first unconsumed offset. | TEST-CMB-011 |
| REQ-CMB-012 | When Lazy(factory) is used, the system shall call the factory once, on first run, enabling recursive grammars 500 levels deep. | TEST-CMB-012 |
| REQ-CMB-013 | When Peek / NotFollowedBy run, the system shall consume nothing; NotFollowedBy fails if the inner parser succeeds. | TEST-CMB-013 |

## Assumptions / risks: deep recursion depth 500 fits the default 1 MB stack (retired by TEST-CMB-012).
