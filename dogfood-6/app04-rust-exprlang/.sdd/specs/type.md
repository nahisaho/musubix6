---
feature: type
tier: T2
---
# type
Goal: sound monomorphic type checker over the parser AST (depends on parse). Non-goals: inference, polymorphism, recursion.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-TYPE-001 | When an integer or boolean literal is checked, the checker shall return Int or Bool. | TEST-TYPE-001 |
| REQ-TYPE-002 | When arithmetic, unary -, comparison, logic, unary ! and equality operators get well-typed operands, the checker shall return Int, Int, Bool, Bool, Bool and Bool respectively. | TEST-TYPE-002 |
| REQ-TYPE-003 | If an operand has the wrong type, then the checker shall return a Mismatch error with expected, found and the span of the offending operand. | TEST-TYPE-003 |
| REQ-TYPE-004 | When an if is checked, the checker shall require a Bool condition and equal branch types, reporting the offending subexpression span. | TEST-TYPE-004 |
| REQ-TYPE-005 | When a let or variable is checked, the checker shall bind lexically with shadowing and report UnboundVar with the variable span. | TEST-TYPE-005 |
| REQ-TYPE-006 | When a lambda is checked, the checker shall return Fn(param types, body type) with parameters in scope in the body. | TEST-TYPE-006 |
| REQ-TYPE-007 | If a call has wrong arity, a wrongly typed argument or a non-function callee, then the checker shall return Arity, Mismatch or NotCallable with the matching span. | TEST-TYPE-007 |
| REQ-TYPE-008 | If == or != is applied to function-typed operands, then the checker shall return a NotComparable error spanning the binary expression. | TEST-TYPE-008 |

## Design
- `check(&Expr) -> Result<Ty, TypeError>`; `check_in(&Expr, &TypeEnv)`; TypeEnv is a persistent Rc linked list so scopes never leak.
- TypeError { kind: Mismatch{expected,found} | UnboundVar(name) | Arity{expected,found} | NotCallable(Ty) | NotComparable(Ty), span }.
- Operator typing is a single table (op -> operand Ty, result Ty); equality is the only polymorphic row (both sides equal, non-Fn).
- First error wins, left-to-right evaluation order; no recovery.
## Assumptions / risks
- Deep nesting recursion fine for test sizes; limit retired by EVAL depth test only for eval.
