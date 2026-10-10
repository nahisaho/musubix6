---
feature: eval
tier: T2
---
# eval
Goal: tree-walking evaluator with lexical closures and error spans (depends on parse; type-checked inputs via type). Non-goals: tail calls, mutation.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-EVAL-001 | When literals, unary and binary arithmetic/comparison/equality expressions are evaluated, the evaluator shall return the Int or Bool result. | TEST-EVAL-001 |
| REQ-EVAL-002 | If integer arithmetic overflows i64, then the evaluator shall return an Overflow error spanning the binary expression. | TEST-EVAL-002 |
| REQ-EVAL-003 | If the divisor of / or % is zero, then the evaluator shall return DivZero spanning the divisor. | TEST-EVAL-003 |
| REQ-EVAL-004 | While evaluating && and \|\|, the evaluator shall not evaluate the right operand when the left decides the result. | TEST-EVAL-004 |
| REQ-EVAL-005 | When let and if are evaluated, the evaluator shall scope bindings lexically with shadowing. | TEST-EVAL-005 |
| REQ-EVAL-006 | When a lambda is evaluated, the evaluator shall capture the defining environment so later shadowing does not affect the closure. | TEST-EVAL-006 |
| REQ-EVAL-007 | When a function returns a function or takes one as argument, the evaluator shall apply it correctly. | TEST-EVAL-007 |
| REQ-EVAL-008 | If a call has wrong arity or a non-closure callee, or a variable is unbound, then the evaluator shall return Arity, NotCallable or Unbound with the call or variable span. | TEST-EVAL-008 |
| REQ-EVAL-009 | If call depth exceeds 200, then the evaluator shall return StackOverflow instead of crashing. | TEST-EVAL-009 |
| REQ-EVAL-010 | When a value is displayed, the evaluator shall print Int as digits, Bool as true/false and a closure as <fn/N> with its arity. | TEST-EVAL-010 |
| REQ-EVAL-011 (test-only) | When a program that passes the type checker is evaluated, the evaluator shall never return Unbound or NotCallable. | TEST-EVAL-011 |
| REQ-EVAL-012 | If i64::MIN is divided by -1 with / or %, then the evaluator shall return Overflow spanning the binary expression instead of panicking. | TEST-EVAL-012 |

## Design
- `eval(&Expr) -> Result<Value, EvalError>`; Value = Int | Bool | Closure(Rc<Closure{params, body, env}>).
- Env is a persistent Rc linked list, so closures share structure and capture by snapshot (immutable).
- Call depth is a counter threaded through eval_in; limit constant MAX_DEPTH = 200.
- Short-circuit is implemented in the Binary arm before evaluating the right side. Errors carry the span of the smallest offending node.
- Checked arithmetic (checked_add/sub/mul/div/rem) maps None to Overflow.
## Assumptions / risks
- Self-application `w(w)` is untypable but parseable; the depth test uses it (spike confirmed).
