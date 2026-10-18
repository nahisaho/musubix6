---
feature: node-summary-verdict
tier: T2
approval: auto
---
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-NODE-SUMMARY-001 | When a Node check exits unsuccessfully and its spec or TAP summary reports executed passing or failing tests, the gate shall report check failure rather than no-test INCOMPLETE even when a test title contains "no tests found"; unchanged passing controls shall remain accepted. | TEST-NODE-SUMMARY-001 |
## PASS conditions and counterexamples
| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-NODE-SUMMARY-001` | both native reporters accept passing checks and return exit 1 with a failed-check diagnostic for executed assertion failures | a failing check with a "no tests found" title returns exit 2 and hides its assertion | TEST-NODE-SUMMARY-001 | original assertion Red: spec/pass exit 2 instead of 0; Green recorded; expanded ten-row characterization and Green; two isolated mutants detected |
Ten finite rows: each of spec/TAP with all-pass (exit 0), mixed pass/fail (1), all-fail (1), all-skipped (2), and no registered owned test (1). The final control must fail the existing required-test ownership contract: Node can count the empty file itself as passing, but the gate must not borrow that result for its required test. These are bounded native registration/verdict states, not an exhaustive test of arbitrary reporter text. Assertions use real Node execution and contract-defined expected exits; neither output from the implementation nor its classifier defines the oracle.
Risk stages: contract=failed executed checks must fail; trusted inputs=native reporter text and actual exit; execution=real isolated fixtures; verdict=positive executed counts take precedence over zero-test phrases in titles; evidence history=real Red/Green, no fabricated execution; integration=the repository's 1084-test run exposed the misclassification while three stale literal self-checks failed.
## Design
Extend the existing positive-execution recognizer with anchored positive Node spec/TAP pass/fail summary lines. Do not change ownership, skip/TODO, malformed-total admission, timeout rules, or any native success checks.
Only the no-test fallback classification changes; a fabricated positive line cannot turn an unsuccessful process into PASS.
## Assumptions / limits
This regression covers two supported native reporters and one test-title collision, not every third-party reporter. Existing native ownership/skip tests and the complete root gate remain required. The interrupted 30-minute run and the subsequent failed/incomplete runs are not passes or release qualification.
## Observed verification
`sdd.mjs tdd red TEST-NODE-SUMMARY-001` recorded the expected assertion failure before the recognizer change, then `tdd green` passed. Extending the test to ten rows was recorded honestly as passing characterization; the earlier failing Red remains in the chain.
An isolated mutant removing positive Node counts failed at spec/pass; a second ignoring failing counts failed at spec/allfail. Both produced the intended assertions, not setup failures. Restored original bytes passed all ten rows; production bytes were never mutated.
Eight existing annotated Node ownership/skip/TODO/reporter/malformed controls passed without skips. The two shared closure regressions were rerun through `tdd refactor`.
The saved pre-fix `npm test` run reported 1084 tests: 1077 pass, 3 fail, 0 skipped, 4 TODO, about 46 minutes. The three stale self-checks now pass: literal compiler-title lookup, CI-to-package suite dispatch, and publish dependency-restore order. No compiler prerequisite, 15-second compiler fixture budget, assertion behavior or existing TODO disposition was relaxed.
The four pre-existing TODO cases are not passing evidence and remain separate stub-heuristic limitations; neither this repair nor the full gate constitutes frozen release qualification.
