---
feature: rules
tier: T2
approval: auto
---
# Rules
Goal: Parse a bounded, non-executable rule DSL. Non-goals: JavaScript expressions.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-RULE-001 | When string equality is evaluated, the system shall compare typed literal values. | TEST-RULE-001 |
| REQ-RULE-002 | When AND and OR coexist, the system shall give AND higher precedence. | TEST-RULE-002 |
| REQ-RULE-003 | When parentheses and NOT are used, the system shall evaluate the explicit grouping. | TEST-RULE-003 |
| REQ-RULE-004 | When numeric ordered comparisons are evaluated, the system shall reject string coercion. | TEST-RULE-004 |
| REQ-RULE-005 | When IN is evaluated, the system shall use a typed literal list. | TEST-RULE-005 |
| REQ-RULE-006 | If an attribute is absent, the system shall make every comparison false. | TEST-RULE-006 |
| REQ-RULE-007 | If input contains invalid tokens or trailing expressions, the system shall throw a syntax error. | TEST-RULE-007 |
| REQ-RULE-008 | When escaped literals and booleans are used, the system shall preserve JSON literal semantics. | TEST-RULE-008 |
| REQ-RULE-009 | If parsing exceeds 64 nesting levels or 4096 characters, the system shall reject the input. | TEST-RULE-009 |
| REQ-RULE-010 | When looking up an attribute, the system shall use only own data properties and shall not invoke accessors. | TEST-RULE-010 |
## Design
Lexer feeds recursive descent (OR, AND, NOT, comparison); AST is data, never eval.
Only finite numeric operands participate in ordering; context lookup has a missing sentinel.
## Assumptions / risks
Node 24 runs erasable TypeScript and node:test by name; runtime spike exercises both.
Default missing values fail closed, including NE. Strings use JSON escapes.
