# T2 review ledger

| id | severity | path:line | state | resolution |
| --- | --- | --- | --- | --- |
| SPEC-1 | med | .sdd/specs/session.md:16 | Fixed | Terminate bypasses the recovery latch and has a network test. |
| SPEC-2 | med | .sdd/specs/query.md:24 | Fixed | Lite portal retention across tx boundaries explicitly documented and tested. |
| REG-1 | high | internal/query/query_test.go:101 | Fixed | New regression tests moved to package scope before Red. |
| REG-2 | high | server/server_test.go:232 | Fixed | New regression tests moved to package scope before Red. |
| STATE-1 | med | server/server.go:260 | Fixed | Parse/Bind now enforce transaction QUERY guard; TEST-SESSION-007. |
| CONTRACT-1 | med | server/server.go:148 | Fixed | Row encoded length bounded before allocation; TEST-SESSION-008. |
| CONTRACT-2 | med | server/server.go:385 | Fixed | Non-text parameter OIDs rejected; TEST-SESSION-009. |

Independent spec reviewers: spec-review and regression-spec-review.
Implementation risk reviews and final gate evidence are recorded below.

Delta review passes: state-delta-review PASS (Parse/Bind guard and no mutation);
contract-delta-review PASS (inclusive row limit and parameter OID consistency).
All finding lines resolved; no Open items remain. No implementation edits after
these clean passes.
Final full gate: PASS exit 0, 55 active REQs, 30/30 tests Red→Green, 66 chained
entries, one explicit retest weak Red; test/vet/race/stress-build-tag checks PASS.
Live CLI TCP smoke: startup, SELECT, text parameters, Describe, Execute, Sync
and Terminate PASS (`tcp-smoke.json`). Listener stopped and binary removed.
