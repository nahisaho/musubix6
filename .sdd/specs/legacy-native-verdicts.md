---
feature: legacy-native-verdicts
tier: T2
approval: auto
---
Reverse spec: rows describe existing behavior, preserving native execution and plugin trust boundaries.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-R33-NODE-001 | When a required annotated Node test is skipped, TODO or omitted in a full/changed gate or flaky retry, the system shall reject evidence even under warn policy while accepting executed owned controls and respecting explicit project/file selection. [src: .github/skills/lean-sdd-tdd/scripts/sdd.mjs:6357, conf: low] | TEST-R33-NODE-001, TEST-R33-NODE-002, TEST-R33-NODE-003 |
| REQ-R33-PYTEST-001 | When pytest_plugins declarations use unresolved/computed/reassigned grammar, the system shall refuse before runner execution or evidence writes; transitive literal declarations and their protected helpers shall retain real native Red/Green/gate behavior. [src: .github/skills/lean-sdd-tdd/scripts/sdd.mjs:5590, conf: low] | TEST-R33-PYTEST-001, TEST-R34-PYTEST-002, TEST-R34-PYTEST-003 |
| REQ-R34-NODE-001 | When Node results supply TDD/gate evidence, the system shall bind execution to one literal owned registration, reject unobservable reporters, ambiguous/parent/skip/TODO results and malformed totals, and permit valid owned native controls. [src: .github/skills/lean-sdd-tdd/scripts/sdd.mjs:1828, conf: low] | TEST-R34-NODE-001, TEST-R34-NODE-002, TEST-R34-NODE-004 |
## PASS conditions and counterexamples
| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-R33-NODE-001` | spec/tap skip/TODO cases fail; real owned execution passes | unrelated passing control or flaky retry blesses skipped annotated target | TEST-R33-NODE-001..003 | all annotated controls genuinely characterized and Green |
| `REQ-R33-PYTEST-001` | computed plugin grammar refuses with unchanged ledger; literal native controls pass | semicolon/continued/reassigned binding executes unpinned plugin | TEST-R33-PYTEST-001, TEST-R34-PYTEST-002..003 | genuine native characterization and Green; retained parameter rows executed |
| `REQ-R34-NODE-001` | owned literal title with valid totals accepted; opaque/ambiguous results rejected | parent title, dot reporter or duplicated title borrows child evidence | TEST-R34-NODE-001..005 | all five tests genuinely characterized and Green, including valid-input controls |
Risk stages: contract=owned native results; inputs=declarations/reporters; execution=real runners; verdict=no borrowed/opaque pass; history=unchanged ledger on refusal; integration=literal metadata and complete parameter cases.
## Design
Restore definitions for existing annotated classifiers and tests without changing admission or execution-verdict logic.
Normalize annotated test titles to unique literal ID-bearing registrations; loops retain all existing combinations inside their owned test.
## Assumptions / risks
The source evidence cites the pre-metadata-refactoring locations. No security rule or assertion is relaxed; missing/skipped native tools cannot establish completion.
All 78 existing annotated repository tests were characterized and Green by actual CLI execution; preflight validates 86/86 test histories. Its `--no-run` exit 2 is deliberately INCOMPLETE, not a full-gate pass.
