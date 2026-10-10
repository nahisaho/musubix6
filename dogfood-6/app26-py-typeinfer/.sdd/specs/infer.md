---
feature: infer
tier: T2
---
# infer
Goal: algorithm W with let-polymorphism, recursion and positioned type errors.
Non-goals: type classes, value restriction, mutual recursion.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-INFER-001 | When a literal is inferred, the system shall return Int for integers and Bool for true/false. | TEST-INFER-001 |
| REQ-INFER-002 | When a variable is inferred, the system shall instantiate its scheme with fresh variables. | TEST-INFER-002 |
| REQ-INFER-003 | If a variable is not in the environment, then the system shall raise InferError kind "unbound" at the variable position. | TEST-INFER-003 |
| REQ-INFER-004 | When a lambda is inferred, the system shall bind its parameter monomorphically and return param -> body. | TEST-INFER-004 |
| REQ-INFER-005 | When an application is inferred, the system shall unify the function type with arg -> result. | TEST-INFER-005 |
| REQ-INFER-006 | When a let binding is inferred, the system shall generalize the bound type over variables free in neither the environment nor the substituted environment. | TEST-INFER-006 |
| REQ-INFER-007 | Where a variable is lambda-bound, the system shall not generalize it, so `\f. (f 1, f true)` is rejected. | TEST-INFER-007 |
| REQ-INFER-008 | When a let rec is inferred, the system shall type the body monomorphically for recursion and generalize afterwards. | TEST-INFER-008 |
| REQ-INFER-009 | When an if is inferred, the system shall require a Bool condition and equal branch types. | TEST-INFER-009 |
| REQ-INFER-010 | When a pair is inferred, the system shall return a TCon "*" of the component types; fst and snd shall be builtins. | TEST-INFER-010 |
| REQ-INFER-011 | When an operator expression is inferred, the system shall use builtin types (+ - * : Int->Int->Int; < : Int->Int->Bool; == : a->a->Bool). | TEST-INFER-011 |
| REQ-INFER-012 | If unification fails, then the system shall raise InferError kind "mismatch" or "occurs": for an application whose function type is known the position is the argument (expected = parameter type, actual = argument type); for a non-function applied the position is the function (actual = its type); `if` reports the condition or else-branch. | TEST-INFER-012 |
| REQ-INFER-013 | When infer_program(src) is called, the system shall return the principal scheme with variables renamed canonically by first occurrence. | TEST-INFER-013 |
| REQ-INFER-014 | The self-application `\x. x x` shall be rejected with kind "occurs". | TEST-INFER-014 |

## Design
Components: infer.py uses parse (AST), types (Subst, generalize, instantiate), unify.
State/invariant table:
| Construct | Env effect | Generalize? | Failure kind |
| --- | --- | --- | --- |
| Lam x | x : mono fresh | no | - |
| Let x=e1 | x : generalize(env', t1) | yes | from e1 |
| LetRec f | f : mono fresh during e1, then generalize | yes after | mismatch/occurs |
| App | none | no | mismatch/occurs at App pos |
| If | none | no | mismatch at branch/cond pos |
Invariants: substitution threaded left to right and applied to env before generalizing; the principal type of a closed term has no free vars outside its quantifier.
## Assumptions / risks: no value restriction; retired by definition (pure language).
