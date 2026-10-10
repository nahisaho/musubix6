---
feature: interp
tier: T2
---
# interp
Goal: tree-walking evaluator for the `lang` AST with lexical closures, `let rec`, builtins and position-carrying runtime errors. Non-goals: tail-call optimisation, mutation, garbage collection.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-INT-001 | When arithmetic, comparison, equality or `+` on two strings is evaluated, the system shall return number/bool/string results; `==` on different value types shall be false. | TEST-INT-001 |
| REQ-INT-002 | When `let` binds a name, the system shall make it visible only in its body and let inner bindings shadow outer ones without changing them. | TEST-INT-002 |
| REQ-INT-003 | When a lambda is evaluated, the system shall capture its defining environment, so later bindings with the same name in the caller never affect it, and independent closures keep independent state. | TEST-INT-003 |
| REQ-INT-004 | When `let rec f = fn..` is evaluated, the system shall bind f inside the function body; a plain `let` shall not (unbound variable); `let rec` with a non-function value shall fail with "let rec requires a function". | TEST-INT-004 |
| REQ-INT-005 | If evaluation fails (unbound variable, division by zero, operand type mismatch), then the result shall be a runtime error with the line/column of the offending node and no value. | TEST-INT-005 |
| REQ-INT-006 | If a call has the wrong number of arguments or the callee is not a function, then the system shall report "expected N arguments but got M" / "cannot call <type>" at the call position. | TEST-INT-006 |
| REQ-INT-007 | While evaluating `&&` / `||`, the system shall not evaluate the right operand when the left decides; `if` and logic operands must be bool else a runtime error "condition must be bool" / "operand must be bool". | TEST-INT-007 |
| REQ-INT-008 | If the call depth exceeds MaxDepth (default 200), then the system shall return a runtime error "stack overflow" instead of crashing, and the interpreter shall remain usable afterwards. | TEST-INT-008 |
| REQ-INT-009 | When builtins `len(string)`, `str(value)` and `num(string)` are called, the system shall return a number / string / number; builtins check arity and argument type like closures. | TEST-INT-009 |
| REQ-INT-010 | If the source does not parse, then Run shall return a parse error (Kind "parse") with the Describe() message and position and shall not evaluate. | TEST-INT-010 |
| REQ-INT-011 | When Show formats values, the system shall print integral numbers without a fraction (`3`), others in round-trip form, strings quoted with escapes, closures as `<fn/N>` and builtins as `<builtin NAME>`. | TEST-INT-011 |

## Design
Components: `Interpreter(maxDepth)` -> `Run(text)` (Grammar.Parse -> Eval) -> `RunResult(Ok, Text, Error?)`; `Env` immutable linked list of `Binding(name, Cell)`; `Cell` holds `Value?`.
Binding state table:

| Binding kind | Cell state at creation | When it becomes readable | Lookup of unset cell |
| --- | --- | --- | --- |
| let x = v | set | immediately in body | n/a |
| let rec f = fn | unset | after the Lambda value is built (closure captures env incl. f) | runtime error "uninitialized" (unreachable: value must be a lambda) |
| parameter | set | on call | n/a |
| builtin | set | root env | n/a |

Evaluation state: `depth` (calls in flight). Invariants: (I1) depth is incremented on closure entry and restored on every exit incl. errors (try/finally); (I2) depth <= MaxDepth; (I3) an Env is never mutated except the single Cell of a let-rec binding, once; (I4) runtime errors are exceptions internal to Eval only and never escape Run; (I5) every error Pos derives from an AST Span.
Decision: closures hold the Env node, not a copy; shadowing = push a new node.
## Assumptions / risks: .NET default stack holds 200 nested closure calls x ~6 frames (retired by TEST-INT-008 using f(100000)).
