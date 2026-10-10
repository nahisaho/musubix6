---
feature: errors
tier: T2
---
# errors
Goal: good error reports: furthest failure wins, expected-sets merge, labels, cut/commit, rendering. Non-goals: localisation.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ERR-001 | When both alternatives of Or fail, the system shall return the failure with the greater offset; at equal offsets the Expected sets shall be unioned (sorted, distinct). | TEST-ERR-001 |
| REQ-ERR-002 | When Label(name) wraps a parser that fails at its start offset, the system shall replace Expected by {name}; deeper failures stay unchanged. | TEST-ERR-002 |
| REQ-ERR-003 | When a Cut() succeeded earlier in a sequence and a later step fails, the system shall mark the failure Committed, and Or shall return a committed failure without trying the next alternative. | TEST-ERR-003 |
| REQ-ERR-004 | When Atomic(p) wraps a parser, the system shall clear Committed on its failures and its successes. | TEST-ERR-004 |
| REQ-ERR-005 | When Many stops because its item parser failed softly at offset k and the following parser fails at k, the system shall merge both Expected sets (hint propagation). | TEST-ERR-005 |
| REQ-ERR-006 | When Describe(source) is called, the system shall render `line L, col C: expected A, B or C but found 'x'` (or `end of input`), using `expected A or B` for two names and the Message when set. | TEST-ERR-006 |

## Design
Components: `Failure(Offset, Expected[], Committed, Message?)`, `ParseResult<T>(Ok, Value, Next, Error, Committed, Hint)`, `Merge(a,b)`.
State table (ParseResult flags):

| Situation | Ok | Committed | Hint |
| --- | --- | --- | --- |
| plain success | yes | no | null or last soft failure (Many stop) |
| after Cut() | yes | yes | - |
| failure after Cut in same sequence | no | yes | - |
| failure inside Atomic | no | no (cleared) | - |

Invariants: (I1) Merge is commutative and idempotent; (I2) merged Offset = max offset; (I3) Expected sorted+distinct; (I4) a committed failure is never replaced by an alternative in Or; (I5) a Hint may lie beyond Next (a soft failure that consumed input) and merges into a later failure by furthest-wins.
Decision: committed flag travels in results (not global state) so combinators stay pure.
## Assumptions / risks: Hint merging cannot mask a deeper real failure (merge keeps max offset; TEST-ERR-005).
