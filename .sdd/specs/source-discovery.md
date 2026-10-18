---
feature: source-discovery
tier: T2
approval: auto
---
Goal: prevent gate/trace/impact from silently omitting large annotated source; retain filtering and bounded resource use.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SCAN-001 | When an included source is at most scan.maxFileBytes (default 16777216 bytes), the system shall scan its complete contents, including annotations beyond 524288 bytes, and include their trace and file-impact relationships. | TEST-SCAN-001 |
| REQ-SCAN-002 | If an included source exceeds the byte limit, then discovery shall exit 1 with an explicit REFUSED source-scan diagnostic and shall not emit a successful trace/gate verdict or write TDD evidence; exactly-at-limit files shall remain accepted. | TEST-SCAN-002 |
| REQ-SCAN-003 | If scan.maxFileBytes is supplied and is not a positive safe integer, then discovery shall exit 1 with an explicit configuration diagnostic; deliberate scan include/exclude filters and ignored generated directories shall remain effective. | TEST-SCAN-003 |
## PASS conditions and counterexamples
| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-SCAN-001` | a 600 KiB source/test pair contributes CODE/TEST and resolves its REQ; impact sees its consumer | unknown REQ after 524288 bytes must fail, not disappear | TEST-SCAN-001 | assertion Red then Green recorded; restored silent-cutoff mutant detected |
| `REQ-SCAN-002` | N bytes accepted at N; N+1 refused with no ledger creation | huge included unannotated file must not be silently dropped | TEST-SCAN-002 | assertion Red then Green recorded; oversize-bypass and equality-rejection mutants detected |
| `REQ-SCAN-003` | positive integer override accepted; zero, negative, fraction, strings, null and unsafe integer rejected | excluded oversize fixture should not block; included oversize source must block | TEST-SCAN-003 | assertion Red then Green recorded; invalid-bound-admission mutant detected |
Risk stages: contract=same discovery for all callers; trusted inputs=explicit numeric bound; execution=check size before content parsing; verdict=never hide oversized inputs; history=refusal before evidence writes; integration=actual own 600/900 KiB files and unchanged runner controls.
Oracle: independently padded fixtures with exact Buffer byte lengths and known annotation sets, not scanner output.
## Design
Use existing workspaceFiles and scanFilter first; stat each included source before scanEntities, throw a typed-by-prefix refusal rather than filter it out.
Apply the bound only to supported source extensions after include/exclude and generated-directory filtering; keep the 16 MiB default aligned with existing single-definition closure bounds, allow positive safe-integer overrides and accept equality. This is a per-file parsing bound, not a cumulative memory/latency guarantee.
Catch only the source-scan refusal prefix at the CLI boundary; unrelated exceptions retain existing error behavior. No spec/test exclusion or approval-policy weakening.
## Assumptions / risks
The pre-repair baseline silently excluded files >=524288 bytes (main ~610 KiB, test ~900 KiB) and reported 22 missing-test errors. Restoring discovery exposed eight missing legacy requirements and missing root execution evidence; their separate reconstructed contracts preserve the existing assertions and verdict policies.
Runtime is Node 24.21.0; other supported environments require separate release validation. The per-file bound does not establish a total workspace resource bound.
## Observed verification
`node --test .github/skills/lean-sdd-tdd/scripts/source-discovery.test.mjs .github/skills/lean-sdd-tdd/scripts/spec-context.test.mjs`: 8 passed, none skipped.
Four isolated source-region mutations each caused the intended assertion failure; restoring the original bytes passed all three scanner regressions. The mutation driver never modified production bytes.
The retained parameterized native controls plus scanner regressions passed 11/11 without skips. All 78 existing annotated repository tests then received genuine passing characterization and Green events through `sdd.mjs tdd`, not fabricated failing Red evidence.
`node .github/skills/lean-sdd-tdd/scripts/sdd.mjs gate --no-run`: trace 38 requirements, zero errors; ledger 201 entries with intact chain; evidence 86/86, including 78 explicit characterizations. Exit 2 is INCOMPLETE because commands were deliberately not run; this is not full-gate or release proof.
The full gate must execute the configured `npm test` check without `--no-run`; no release qualification run is claimed here.
