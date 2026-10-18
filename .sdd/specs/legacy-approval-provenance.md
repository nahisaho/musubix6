---
feature: legacy-approval-provenance
tier: T2
approval: auto
---
Reverse spec: this row describes the existing approval-provenance behavior.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-R30C-001 | When a T2 design and review are edited without a genuine approve-record event, the system shall reject manually rehashed approvals in full/changed gates; a genuine reviewed baseline shall pass. [src: .github/skills/lean-sdd-tdd/scripts/sdd.mjs:1076, conf: low] | TEST-R30C-001 |
## PASS conditions and counterexamples
| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-R30C-001` | reviewed baseline passes; edited design/review with old event provenance fails | changing only approval/review hashes blesses unreviewed design | TEST-R30C-001 | genuine passing characterization and Green recorded by the CLI |
Risk stages: contract=genuine approval; inputs=spec/review/hash; execution=approvalState; verdict=reject forged provenance; history=hash-chained event; integration=full/changed native fixture controls.
## Design
Restore the requirement definition referenced by the existing provenance regression and annotate the existing approvalProvenance helper without changing its logic.
Genuine AI review is required for missing auto locks; this reconstruction never fabricates human approval or manually edits ledger events.
## Assumptions / risks
The retained regression is characterization, not newly invented failing-Red evidence. Current root preflight confirms 86/86 valid test histories; its deliberate `--no-run` exit 2 is not a full-gate pass or release evidence.
