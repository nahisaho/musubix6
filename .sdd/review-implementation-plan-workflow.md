spec: sha256:97fabda265361a78dd07854d76e38880fd40483009ef6be65310ac44ce4aac56
verdict: pass
open: 0

# Implementation-plan workflow findings

| ID | Severity | Where | Status |
| --- | --- | --- | --- |
| FLOW-INVENTORY | S2 | Workflow Design Regression002: derive inventory from actual npm entries and tracked role files, compare bytes/modes and resolve shipped helpers in-tree. | Closed |
| FLOW-HOST-DRIFT | S2 | Workflow Design Regression002: compare both installed role trees against the extracted package. | Closed |
| FLOW-ISOLATION | S2 | Workflow Design Regression002: offline ignored-script pack, private cache/config/HOME and exact temporary cleanup. | Closed |
| FLOW-RUNTIME | S2 | Workflow Design Regression002: record actual runtime version and tarball SHA256, not inferred labels. | Closed |
| FLOW-ADOPTION-ORACLE | S2 | Regression001: token-only receipt check accepted omitted adoption because failed receipts were still mentioned; require the explicit current-successful adoption and status obligations. | Closed; actual final-hash assertion Red/Green and isolated detected/restored mutation |
| FLOW-ARCHIVE-INPUT | S2 | Regression002: Git-free materialized source failed because the fixture assumed checkout metadata; select explicit archive inventory only when .git is absent, retain Git-error refusal and compare archive against checkout inventory. | Closed; actual unfiltered Git-free Node20 control and both isolated detected/restored input mutations |
| FLOW-EVIDENCE-FLAG | S3 | Observed002 table cell must distinguish passing runtime rows from the overall-false earlier report and separate unfiltered archive follow-up. | Closed; explicit cell wording with both report identities and Node20-only archive limit |
| FLOW-GIT-DIAGNOSTIC | S2 | Regression002's invalid-present-Git control rejected newer Git's correct exit128 because stderr wording differed. First failed condition: verdict. | Closed; genuine same-body native assertion Red/Green, both observed diagnostics, unrelated-exit negative control, actual three-runtime/archive controls and19/19 restored mutations |
| FLOW-OPTIONAL-POLICY | S3 | Own-project adoption must not silently enable permanent planning or replace the full native gate with a four-feature check. | Closed design; explicit temporary scope, unchanged native policy, guarded exact restoration, identical re-enable control and before-gate/commit equality checks |

Claude Sonnet 5.5 independently reviewed workflow ownership and distribution
on separate risk axes before production edits. The ownership reviewer accepted
the role sequence and separate evidence/readiness levels, then reported CLEAN2
on the described disabled controls and explicit text-only limits without
rereading or execution. Existing state/CLI multi-hop tests cover transitive
invalidation; per-installation package smoke fixtures do not repeat enumeration.

The distribution reviewer found the four S2 design gaps above. It read only
the revised Regression002 paragraph and reported CLEAN after their resolution,
without executing the proposed controls. Its initial unrequested npm dry-run
is not feature or packaged-execution evidence. At that design checkpoint,
the test implementation had not yet been independently reviewed or executed.

Actual prior feasibility111calls is recorded in the existing workflow spec.
No golden-text test proves agent obedience; no fixture gate or tarball smoke
is a full-project gate, frozen qualification or publication approval.

Implementation review: the ownership reviewer actually read the four role
sections/disabled directives, then separately both new README sections,
TEST003 and the model Design fingerprint correction, reporting CLEAN.
The distribution reviewer read TEST002/helpers and package registration,
reporting CLEAN; it confirmed bytes are compared with source, archive modes
with npm file.mode, and both installed inventories with the archive.
Both are text/code inspections, not independent executions or log audits.

The initial actual runtime matrix passed21/21 on each Node20/22/24 and new-file
diagnostics passed (`v027-workflow-validation-zlfmG6/report.json`).
The first isolated mutation run detected14/15; the adoption survivor above
remains retained in `v027-workflow-mutations-AzSwgi/report.json`.
An explicit Git-free source control failed at git exit128, retained in
`v027-workflow-archive-control-8Vd3AU/`; it is a fixture-input failure, not a
behavioral feature Red. These findings blocked completion rather than being
silently treated as excluded or downgraded.

Both reviewers read only their bounded adoption/inventory design and fixture
deltas and accepted them without execution. The distribution review confirmed
lstat distinguishes absence from invalid present metadata; no Git error is
converted to an archive fallback. Frozen digests remain the authenticity
boundary for Git-free sources. Exact-phrase normative tests deliberately
couple wording and oracle; they still do not prove agent obedience.
Final-hash Reds/Greens actually ran. The final mutation report is
`v027-workflow-mutations-eocqo5/report.json`:17/17 with exact restoration and
zero-skip controls. Runtime rows in `v027-workflow-validation-UvWs8T/report.json`
are21/21 for each actual Node20/22/24 and diagnostics pass, but its overall
false flag remains unchanged because the separate selected Node20 archive
control counted two filtered tests as skipped. The bound follow-up
`v027-workflow-archive-validation-0z31Xl/report.json` actually runs all3 archive
cases without filtering,3pass/0skip; combined checks pass.
The ownership reviewer read only the final observed section/cells and
reported CLEAN2, not an independent log audit. The distribution reviewer
read those same passages, requested the cell clarity fix above and accepted
the other evidence/limits wording. It then read only the corrected cell
and reported CLEAN2 without execution or report/log reads. Production files are unchanged after
the actual final validation. All own-project/full-gate/qualification and
publication limits remain explicit.

## Git-oracle checkpoint follow-up

The preceding observations are historical. Hosted test run41730888446 on
d7659a1 failed FLOW002 across Node20/22/24 because Git's valid refusal text
changed; Windows development controls passed independently. Production
inventory selection was already correctly refusing invalid present Git
metadata. The repaired test predicate requires its owned AssertionError with
actual128/expected0, not localized stderr. It is not a general diagnostic
parser: any Git exit128 has this shape; the preceding valid checkout and
actual invalid-gitfile fixture provide cause/context.

Native assertion Red preceded the shared predicate change, preserving the
annotated regression body; Green and unaffected001/003 Refactors passed.
`v027-workflow-validation-nb50t1/report.json` actually records21/21 on each
Node20.20.2/22.23.3/24.22.1, unfiltered Git-free3/3, zero skips and JS
diagnostics PASS. `v027-workflow-mutations-3fgIeQ/report.json` records19/19
isolated assertion detections with restored valid controls and unchanged
source, retaining all17 earlier mechanisms and adding text-restricted and
unbound-exit predicate reversals. These are development controls, not frozen
qualification runs or a current-head hosted success.

Both existing Sonnet5.5 workflow reviewers independently read only the
contract/regression delta and optional self-execution protocol, then reported
CLEAN2. They did not execute commands or inspect report/log contents.
The bounded restoration-equality suggestion was incorporated; reviewers'
clean text verdict does not attest execution or automatic cleanup after
SIGKILL/lost session. Root-specific task adoption still requires actual
current receipts and exact final configuration checks; the complete original
native project gate, renewed release-preparation approval and frozen
qualification remain separate requirements.

## Initial own-project execution and final-binding review

Actual `v027-self-adoption-lrY8oe/report.json` passed15 genuine task
verifications and explicit receipt adoptions under the earlier85db56af
binding. Both enabled controls reported15complete and both disabled controls
passed. Original config matched committed bytes, SHA256
`6a09572708b9e204372bae8e52ab1287b907d144053baba313faaaa3bc9cb959`.
The retained first `U06kEb` attempt had one real PASS receipt followed by the
driver's unsupported authored `completed`; the model correctly rejected it.
Guarded restoration passed. Correcting the harness spelling is not product
Red evidence, a new product defect or qualification credit.

Both existing Sonnet5.5 reviewers read only the Goal, historical-status
sentence and final observation/rebinding paragraphs, without execution or
report/log audit. The distribution reviewer requested explicit same-head-CI
and earlier-binding wording; both were applied. Both reviewers read only
the final changed Goal/closing lines and returned CLEAN with no unresolved
correctness finding. This final amendment deliberately changes the whole-spec
digest; the initial report is not current-source proof.
Current receipt/input hashes, affected-task fresh verification and
configuration restoration must be recorded in the generated
`.sdd/evidence/v027-workflow-integration.json` before current completion is
claimed. No full native gate, current-head CI or release credit is inferred.
