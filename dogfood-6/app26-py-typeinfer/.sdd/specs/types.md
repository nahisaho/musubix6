---
feature: types
tier: T2
---
# types
Goal: immutable type terms, substitutions, schemes, generalization and instantiation.
Non-goals: unification, inference.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-TYPES-001 | The system shall represent types as TVar(id) or TCon(name, args) with structural equality and hashing. | TEST-TYPES-001 |
| REQ-TYPES-002 | When ftv(t) is called, the system shall return the set of TVar ids occurring in t. | TEST-TYPES-002 |
| REQ-TYPES-003 | When Subst.apply(t) is called, the system shall replace bound TVars recursively until none of the substitution's domain remains (idempotent). | TEST-TYPES-003 |
| REQ-TYPES-004 | When s1.compose(s2) is called, the system shall return a substitution equivalent to applying s2 first then s1. | TEST-TYPES-004 |
| REQ-TYPES-005 | When generalize(env, t) is called, the system shall quantify exactly ftv(t) minus ftv(env). | TEST-TYPES-005 |
| REQ-TYPES-006 | When instantiate(scheme, supply) is called, the system shall replace each quantified variable by a distinct fresh TVar, consistently within one call. | TEST-TYPES-006 |
| REQ-TYPES-007 | When a substitution is applied to a Scheme, the system shall not touch its quantified variables and shall avoid capturing them (rename a quantified id that occurs free in a replacement). | TEST-TYPES-007 |
| REQ-TYPES-008 | When Supply.fresh() is called repeatedly, the system shall return strictly increasing ids, never colliding with ids already in use via Supply.reserve(t). | TEST-TYPES-008 |
| REQ-TYPES-009 | When instantiate(scheme, supply) is called and the supply produces ids that overlap the scheme's quantified ids (e.g. 0->1, 1->0), the system shall still substitute simultaneously and never raise or loop. | TEST-TYPES-009 |

## Design
Components: types.py (terms, Subst, Scheme, Supply, TypeEnv helpers).
State/invariant table:
| Object | State | Invariant | Test |
| --- | --- | --- | --- |
| Subst | dict id->Type | apply is idempotent when built by unify; compose(s1,s2).apply(t)==s1.apply(s2.apply(t)) | TEST-TYPES-003/004 |
| Scheme | (vars, body) | quantified vars are shadowed during substitution | TEST-TYPES-007 |
| Supply | next id | monotonic, never reuses reserved ids | TEST-TYPES-008 |
## Assumptions / risks: none beyond invariants above.
