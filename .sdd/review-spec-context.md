# spec-context finding ledger

| ID | Severity | Location | State | Resolution |
| --- | --- | --- | --- | --- |
| CTX-01 | S2 | .sdd/specs/spec-context.md:24 | Fixed | Defined exact matching, ambiguity rejection, root containment and changed-file ownership after independent spec review. |
| CTX-02 | S3 | .sdd/specs/spec-context.md:25 | Fixed | Bounded overflow index to 10 entries with 120-character labels; explicitly separated AI output budget from local scanning. |
| CTX-03 | S3 | .github/workflows/publish.yml:41 | Fixed | Added the context suite to the publish prerequisite, matching CI. No publish was executed. |
| CTX-04 | S3 | .github/skills/japanese-prose/scripts | Fixed | Removed generated diagnostic bytecode; fresh package dry-run contains context module/tests and no bytecode. |
| CTX-05 | S2 | .github/skills/lean-sdd-tdd/scripts/spec-context.mjs:37 | Fixed | Assertion regressions now reject a non-table plan and a selector naming both a feature and a different REQ owner; both isolated mutations detected. |

Independent Claude Sonnet 5.5 spec review preceded implementation; implementation review found no significant issues.
Documentation/integration review identified CTX-03/04; the final independent delta review confirmed both resolved and no open findings.
The implementation was unchanged between its clean review and the clean final delta pass; final delta was not a second broad implementation audit.
GiNZA quick diagnostic completed: score 99, no findings in added prose; existing line-5 genitive-chain finding kept as out of scope. Structural lint findings are also pre-existing.
Root gate remains FAIL: isolated HEAD confirms the same 22 trace errors and two missing locks. Targeted checks are not release qualification; no tag/publish is authorized.
