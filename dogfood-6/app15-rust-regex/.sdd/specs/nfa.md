---
feature: nfa
tier: T2
---
# nfa
Goal: Thompson construction from the parse AST plus an epsilon-closure state-set simulator (full-match semantics, no backtracking). Depends on feature parse (rx-syntax `Ast`, `ClassSet`). Non-goals: match priority, leftmost search, captures extraction.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-NFA-001 | When an AST is compiled, the system shall build an `Nfa` with exactly one `Match` state, a valid `start`, and `groups` equal to the capture count. | TEST-NFA-001 |
| REQ-NFA-002 | When `Literal`, `Any` or `Class` is compiled, the system shall emit one consuming `Class` state; `Any` shall match every char except `\n`. | TEST-NFA-002 |
| REQ-NFA-003 | When a concatenation is compiled, the system shall match exactly the sequential strings (`ab` matches "ab" only). | TEST-NFA-003 |
| REQ-NFA-004 | When an alternation is compiled, the system shall match any branch, including an `Empty` branch. | TEST-NFA-004 |
| REQ-NFA-005 | When `*`, `+`, `?` are compiled, the system shall match 0+, 1+, 0..1 repetitions respectively, even for nested empty-matching bodies such as `(a*)*`, `(a\|)+`. | TEST-NFA-005 |
| REQ-NFA-006 | When `{n,m}` / `{n,}` is compiled, the system shall match n..=m (n.. unbounded) repetitions by expansion. | TEST-NFA-006 |
| REQ-NFA-007 | If expansion would exceed 100000 states, then the system shall return `NfaError::TooBig` instead of allocating. | TEST-NFA-007 |
| REQ-NFA-008 | `eps_closure(seeds, at_start, at_end)` shall return the sorted set of states reachable through Split/Save/satisfied-assertion edges, terminating on epsilon cycles. | TEST-NFA-008 |
| REQ-NFA-009 | When `Start`/`End` anchors are compiled, the system shall let them pass only at position 0 / at end of input (`^a$` matches "a"; `a^` and `$a` match nothing). | TEST-NFA-009 |
| REQ-NFA-010 | For every compiled NFA, `validate()` shall hold: all targets in range, one Match, and state count <= 2*pattern-length+2 for patterns without counted repetition. | TEST-NFA-010 |
| REQ-NFA-011 | When groups are compiled, the system shall emit `Save(2i)`/`Save(2i+1)` epsilon states that do not change the language. | TEST-NFA-011 |
| REQ-NFA-012 | `is_match` shall operate in O(len(input) * states) and treat input as Unicode scalars (multi-byte chars match one `Class`). | TEST-NFA-012 |

## Design
Components: `State` enum · `Builder` (continuation-passing: `build(ast, next) -> start`, placeholders patched for loops) · simulator (`cur` / `next` state sets, `eps_closure`).

| State | Fields | Epsilon? | Consumes |
| --- | --- | --- | --- |
| Class | set, next | no | one char in set |
| Split | a, b | yes | - |
| Save | slot, next | yes | - |
| AssertStart | next | yes iff pos==0 | - |
| AssertEnd | next | yes iff pos==len | - |
| Match | - | - | accepting |

| Invariant | Enforced by |
| --- | --- |
| exactly one Match (index 0) | builder creates it first |
| all targets < states.len() | `validate()` |
| closure result sorted, deduped | visited bitmap, ascending collect |
| size bound 100000 | check after each push |
## Assumptions / risks
Epsilon cycles (`(a*)*`) retire via REQ-NFA-005/008 visited set. Deep AST recursion bounded by parser depth 200 (parse REQ-PARSE-011).
