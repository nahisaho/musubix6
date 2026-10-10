# Independent T2 review record
| id | sev | path:line | state |
| --- | --- | --- | --- |
| SPEC-001 | med | .sdd/specs/history.md:12 | Closed |

SPEC-001: Recovery guarantee conflicted with fail-closed truncated tails. Narrowed to intact logs and explicitly documented operator recovery; independent delta review passed.
Specification reviewer: app008-spec-review; delta reviewer: app008-spec-review-final.
Risk reviews and delta reviews are recorded below after implementation.
| STATE-001 | high | packages/runtime/src/index.ts:82 | Closed |
| CONTRACT-001 | med | packages/runtime/src/index.ts:128 | Closed |

STATE-001: Independent state and contract reviews confirmed unfinished attempts allocate new keys after restart.
CONTRACT-001: Independent contract review confirmed inherited toString executes as an unregistered provider.
STATE-001 fixed by resuming the unresolved persisted attempt; TEST-RUNTIME-011 assertion Red → Green.
CONTRACT-001 fixed by own-property callable allowlist for both provider kinds; TEST-RUNTIME-012 assertion Red → Green.
Refactor: latest-event projection uses single-pass findLast, eliminating allocated filtered arrays without changing event semantics.
Delta reviewer: app008-delta-risk-review.
Round 1: PASS, fixes and TEST-RUNTIME-011/012 validated with actual runtime and typecheck.
Round 2: PASS, pending second/final attempts, persisted keys, inherited custom providers, non-callable compensations, explicit own toString and retry regression checked.
Open residual findings: 0.
