---
feature: unify
tier: T2
---
# unify
Goal: most general unifier with occurs check and structured failures.
Non-goals: source positions (added by infer).

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-UNIFY-001 | When two identical types are unified, the system shall return the empty substitution. | TEST-UNIFY-001 |
| REQ-UNIFY-002 | When a TVar is unified with a type not containing it, the system shall bind it (either argument order). | TEST-UNIFY-002 |
| REQ-UNIFY-003 | If a TVar is unified with a type that contains it, then the system shall raise UnifyError kind "occurs" (e.g. a ~ a -> b). | TEST-UNIFY-003 |
| REQ-UNIFY-004 | When two constructors with the same name and arity are unified, the system shall unify arguments left to right, threading the substitution. | TEST-UNIFY-004 |
| REQ-UNIFY-005 | If constructor names or arities differ, then the system shall raise UnifyError kind "mismatch" carrying both (substituted) types. | TEST-UNIFY-005 |
| REQ-UNIFY-006 | The returned substitution shall be idempotent and make both sides equal after apply. | TEST-UNIFY-006 |
| REQ-UNIFY-007 | The returned substitution shall be most general: for a ~ b -> c with b ~ Int it shall not bind more variables than necessary. | TEST-UNIFY-007 |
| REQ-UNIFY-008 | When unify_all(pairs) is called, the system shall unify the pairs in order and report the first failing pair index. | TEST-UNIFY-008 |
| REQ-UNIFY-009 | When a failure happens deep inside a type, the system shall report the outermost types of the unify call as context and the innermost clashing pair as culprit. | TEST-UNIFY-009 |

## Design
Components: unify.py depends on types.py (Subst, ftv). Algorithm: apply current subst to both sides, then case split.
State/invariant table:
| Case (after apply) | Action | Failure |
| --- | --- | --- |
| t == t | return s | none |
| TVar a, t | occurs(a,t)? fail : bind | occurs |
| t, TVar a | symmetric | occurs |
| TCon n args, TCon m args2 | n==m and same len: fold | mismatch |
| otherwise | fail | mismatch |
Invariant: result domain disjoint from the range's ftv (idempotent).
## Assumptions / risks: recursion depth for deep types is accepted (Python limit) — documented, not handled.
