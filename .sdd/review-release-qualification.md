# Stable 0.2.5 qualification delta findings

| ID | Severity | Evidence | State |
| --- | --- | --- | --- |
| V025-NAMES | S2 | Native revision 9 preflight: one renamed Rust case and four resolved historical TODO names were absent. | Resolved in human-approved revision 10; explicit committed lineage, mandatory active replacements, genuine regression Reds/Greens and native controls. |
| V025-RECHECK | S2 | Independent lineage design review: freeze-only negatives did not establish frozen-recheck enforcement. | Resolved; all eight registered/required/excluded states per five replacement names tested at freeze and structurally rehashed recheck. |
| V025-PROVENANCE | S2 | Independent lineage design review: clarify whether old names belong to the target commit. | Resolved; old names come from the SHA-bound inherited manifest, target names/bytes from independently verified committed content references. |
| V025-INTERRUPTED | S2 | Interrupted revision 9 gate left an untracked test work root; revision 10 trace failed on its duplicate/unknown annotations. | Resolved; exact generated work root quarantined externally, failed report retained, unchanged-source full gate rerun PASS. |

Review model: Claude Sonnet 5.5. Data and implementation reviews were bounded and
did not independently execute tests. The final lineage implementation review
inspected production resolver/call sites, not the test/spec bodies. The agent's
retained execution, inventory and mutation evidence is separately consumed by
`.sdd/evidence/v025-development.json`; it is not expanded into reviewer claims.

The full gate retains implementation-drift, trace/stub, historical refactor and
missing quarantined-fixture check-resolution warnings. Actual project checks
completed, tracked inputs stayed fixed, and trace has zero errors. No warning
was silently removed or downgraded. Technical release readiness remains pending
two fresh complete runs of one exact frozen 24-cell manifest. This record grants
no main push, tag or npm-publication authority.

## 0.2.6 nested oracle runtime delta (2026-11-03)

| ID | Severity | Evidence | State |
| --- | --- | --- | --- |
| V026-ORACLE-PATH | S2 | The outer Node24 oracle supplied its PATH to mandatory nested Node20 mutations; required frozen ownership control timed out. | Fixture corrected using the existing canonicalEnvironment helper; preserves private environment, required controls, titles and budgets. Fresh qualification remains pending. |

Claude Sonnet 5.5 reviewed only the source delta and its existing-plan evidence
section: CLEAN. It inspected the actualMutation call site, canonicalEnvironment
and environment consumption, but did not inspect execution logs or run tests.
A subsequent narrower Sonnet 5.5 evidence review was CLEAN after reading the
actual Red/Green, mutant and baseline/restoration logs and report. This was
not a second full source review. Neither reviewer executed tests.

The evidence review confirmed two native runtime-invariant assertion failures
before correction, 29/29 zero-skip controls after correction, the same two
assertion failures under isolated PATH reversal, and 29/29 restored controls.
It verified the repository oracle SHA256
`a02433743edbf70cf1c3bc36e33949c15fc946c6ad03d6dfe8679e9a9598d9b5`
and read matching original/current work-copy digests in
`v026-oracle-path-mutation-NExjTS/report.json`; it did not independently hash
that work copy or read the entire external execution helper.
The first spike's dependency setup error is not Red, and neither the fixture
runs nor the failed 14-cell frozen prefix carry qualification credit.
No requirement/policy approval, timeout increase, release-readiness finding,
tag or publication authorization follows from these bounded reviews.

## Prospective0.2.7 preparation, not release approval

Current proposed specification SHA256:
`5fc637d0dac55de1920533cd7f3a5f7a965eba8046958a0bd29db414f1586de0`.
The new versioned scope/content contracts are both revision1; historical0.2.6
revision13/6 files remain unchanged. No new human lock is recorded yet.

| ID | Severity | Evidence | State |
| --- | --- | --- | --- |
| V027-APPROVAL-UNIT | S2 | Initial contract review questioned whether retained historical artifacts belong in the current approval unit. | Resolved in design; reviewer verified the actual exact seven-artifact admission shape and accepted current spec plus six current frontmatter artifacts, with history retained separately. |
| V027-EVIDENCE-PIN | S3 | Prior candidate-identity evidence needed an immutable source binding. | Resolved; main PASS table names committed0ce5485 version-preparation evidence, without transferring release credit. |
| V027-CUTOVER-BINDINGS | S3 | Current locked-array, scope/content positions and selected stable version must change together. | Explicit in design; production cutover and native assertion Red/Green remain pending genuine preparation approval. |
| V027-SOURCE-MODES | S3 | Exact0664/0775 source modes are distinct from Git's executable-bit metadata and normalized0644/0755 package modes. | Inherited strict origin policy retained; actual archive/npm/both-host inventories matched. Different checkout permissions must reject or use the canonical permission-preserved archive, never silently redefine the reference. |

Actual external `v027-release-policy-summary.json` asserts unchanged24required
cells/budgets, exclusions, support/legacy policy, historical mappings,
13semantic/14placeholder mechanisms and60origin sensitivities. All111old paths
and modes remain; seven new planning modules/tests make118files and
1180source/1240vendor/1253total skill cases. Credits remain0 and publication
flagsfalse. Scope/content digests and lineage/source commit agree.

`v027-release-policy-spike-rKZZ61/report.json` records actual Node24
committed-source/archive/npm118-file byte/mode equality and both source-init
and package-init Copilot118/Claude115 complete inventories. The earlier
archive/npm-only sO7vtt spike remains retained. These are feasibility controls,
not native adapter tests, a full gate, three-runtime inventory qualification
or frozen clean-run credit.

Claude Sonnet5.5's contract reviewer read the new Design/top-level data and
bounded summary, directly checked current/predecessor/content hashes and Git
tree identity, and reported CLEAN without executing or auditing the spikes.
The independent inventory reviewer directly compared all118 path/digest rows
with committed Git blobs, verified111old/sevennew paths and unchanged policy
rows/counts, and reported CLEAN. It did not inspect the spikes, context file,
Node20/22 execution or actual npm archive; its package-mode review was limited
to the declared executable/nonexecutable mapping.

Structural lint retains exactly the four inherited lexical flags about
Node's TODO classification/replacements; the new literal is code-formatted
and there are zero new flags. This is not a clean-whole-document claim.
Commit the proposed contracts before human preparation approval.
No new human lock, native qualification Red/Green, final full gate/current-head
CI success, two qualifying runs, merge, tag or publication is claimed here.

## Approved0.2.7 implementation and targeted validation

The prospective section above records the7060ce4 checkpoint, not the current
approval status. The user subsequently approved all seven displayed exact
paths/hashes for preparation and subsequent implementation only. Native
`approve record release-qualification --by nahisaho` recorded that genuine
human decision; all seven artifact bytes remain unchanged.

The four production helpers now select the approved0.2.7 scope/content,
stable target and118/1180/1240/1253 inventory together. Actual native owning
assertion Red then same-body Green passed for admission, catalogue and
package-receipt verdict. A fourth actual-package execution regression
failed against the restored original stale0.2.6 execution target, then passed
after its0.2.7 repair. This is separate from the earlier receipt-verdict Red.
Existing synthetic0.2.6 publisher/changelog fixtures remain intentionally
version-generic historical controls.

The first shared Refactor batch retained six failures: a stale host-fixture
target and missing TypeScript through the absent worktree dependencies.
After those real failures, the existing approved dependencies were restored
without installation, and the current host fixture was aligned while
retaining its separate synthetic legacy control. All six affected Refactors
then passed; all18 shared controls have actual successful native Refactors.
Those setup/harness failures and Refactors are not additional assertion Reds.

`release-v027-development.json` retains the actual native events/logs and
the bound runtime/mutation reports. Actual Node20.20.2,22.23.3 and24.22.1 each
passed all26 independently named release/host tests with zero skips, TODOs,
cancellations or failures, including real offline package execution.
All11 isolated Node24 mechanism mutants failed by assertion; every exact
restoration and selected valid control passed, as did initial/final complete
controls. Original source bytes were unchanged and the owned snapshot was
removed. This is bounded mechanism coverage, not exhaustive mutation proof.
Scoped ESLint9 recommended diagnostics passed for the six changed modules
plus the generated flat config, seven files total, not full-project lint.

Both retained Claude Sonnet5.5 reviewers reported CLEAN on the six-script
implementation delta. They read the production diff and changed test
ranges/stale-selector search, not complete test bodies or raw execution
logs, and executed nothing. Both reviewers subsequently reported a second
CLEAN round after independently matching all13 runtime source-manifest
digests and all seven genuine approved artifact digests to current files,
checking approval/configuration and zero-credit/pending flags, and reading
the actual runtime/mutation report metadata. They did not inspect the raw
assertion/TAP logs or execute tests. The inventory reviewer also did not
read this appended prose or independently recount exactly six failed
Refactors. These are bounded hash/contract/report reviews, not independent
duplicate execution proof; implementation source remained unchanged.

The old CODE hashes captured at preparation approval remain honest history;
they were not rewritten into a fictitious later human implementation approval.
Full project gate, current-head hosted CI, two identical frozen24-cell clean
runs and separate exact-artifact human publication approval remain pending.

## Prospective0.2.7 reference revision2

The previous sections remain historical checkpoints. Current proposed spec
SHA256 is `28c74792bafb2830fe046710dcf3e7012cfddf61dbdeeb25a46c31a5cfdc6cbf`;
scope/content revisions are2, with their actual revision1 predecessor hashes
retained. The old human lock is deliberately stale; no new human decision
or publication authority is recorded by this review.

| ID | Severity | Evidence | State |
| --- | --- | --- | --- |
| V027-R2-REFERENCE | S2 | Repair946647f changes the native dispatcher and adds its regression; the old canonical reference must not admit changed bytes. | Prospective revision2 independently rebinds exactly two canonical digests, preserving all118 paths/modes and every cell/count/policy; fresh human approval remains required. |
| V027-R2-ORACLE | S2 | Synthetic V8 stress also stopped the repaired Node22 natural path. | The separately auto-reviewed CLI contract replaces that unsound timing verdict with actual exit-boundary observation; failed runs remain history and the new006 stays mandatory through discovery. |
| V027-R2-WRAPPER | S3 | The root wrapper is outside the118 canonical skill rows and the seven-artifact preparation unit. | Its committed/archive/npm bytes were independently checked; existing freeze recursively binds the full source plus archive/package. Explicit retained-wrapper hash confirmation remains required before qualification credit. |

Two retained Sonnet5.5 risk reviews were CLEAN/CLEAN2 on the unchanged
reference delta. The contract review checked the two manifest/spec diffs,
hash crosslinks and seven-artifact unit, but not raw spike execution.
The inventory review independently matched all118 paths/digests to Git,
all11 intended-delta digests to disk and the unchanged counts/modes.
It read the compact comparison/spike summaries, not the24 terminal logs
or archive/npm payloads. Both second rounds reused their earlier reads
and reported no new execution or independent freeze-coverage verification.
These limits do not become blanket implementation or readiness approval.

Actual `v027-shutdown-reference-review.json` records unchanged24-cell
budgets/exclusions/legacy rules/mappings and13semantic/14placeholder/60origin
policies,118 unchanged paths/modes and correct predecessor/content hashes.
`v027-release-policy-spike-6AGkYy/report.json` records all118 committed/archive/
npm bytes/modes, five root package inputs, four full host inventories and
24 installed/wrapper0/1/2 controls on Node24 only. The development-evidence
file appends these preparation facts without rewriting its old checkpoint.
Repair946647f and all15 current task adoptions are committed; its actual
Windows development jobs20/22/24 passed. Original-test CI remains separately
observed. Fresh human approval, current-reference native admission/preflight,
original full gate, final-head hosted checks, two frozen complete clean runs
and exact-artifact publication approval remain required; qualification credit0.

## Frozen revision2 failure and history-restoration design

This is a new checkpoint, not a correction of the preceding historical
preparation record. Original full gate and same-head Linux/Windows matrices
and authenticated npm dry-run passed on20aa49b. The frozen rOukzS manifest
SHA256 is `1eac38dcc3696621634cdbdc72c071cdc30f7013b2dceb81534656900b105613`.
Its source/archive/npm wrapper fingerprints were explicitly checked before
execution; no real publication was attempted.

Run-Kz6a5c passed20 required cells, then REGRESSION-20 exited1 with four
archive-fixture setup errors, not an assertion Red or a runtime timeout.
The failed run and hash-chained history remain intact. Three later cells
were not run, no second run started, and the streak remains0.

| ID | Severity | First violated stage / evidence | State |
| --- | --- | --- | --- |
| V027-GIT-EXEC-001 | S2 | Execution: materializeSource restores frozen Git only for gate, so four executed-suite self-tests cannot archive approved946647f. | Open; blocks readiness. Exact seven-artifact amendment, implementation, owning Red/Green and mutation verification are pending. |
| V027-GIT-MODE-002 | S2 | Contract: a proposed history-presence mode selector would let executed suites without history silently copy instead of fail. | Design resolved before implementation: explicit discovery kind, mandatory suite/gate history. Does not resolve the execution finding above. |

The amended spec SHA256 is
`5914e39b4134afe5c44de97fdd1f576c010afdc0874cde3e725fb4e5c39f6858`.
All six other human artifacts retain their previous exact digests.
Contract and test-adequacy reviewers each reached CLEAN/CLEAN2 on the
bounded design delta after the mode-selection finding was corrected.
They read the amendment, relevant existing materializer/discovery code or
call sites in the first round, then only closing lines and compact spike
summary fields in the last round. Neither executed commands or inspected
the spike's raw bundle/command details; the contract review's last output
also truncated the evidence cell. These are design reviews, not code,
native-evidence, approval or qualification verification.

Independent `v027-suite-history-spike-P14wwx/report.json` actually cloned
only the retained frozen bundle, checked candidate HEAD20aa49b, proved
approved946647f is its ancestor and archived all118 exact canonical
bytes/modes. Its owned payload was removed and credit remains0.
Append-only `frozenRevision2Failure` evidence retains the actual failure,
four test identities, old manifest/artifact hashes and this zero-credit
feasibility. No source/test implementation was changed at this checkpoint.
Fresh genuine human seven-artifact approval is required before the new
owning assertion regression and implementation. A successor frozen manifest
must record the failed predecessor digest/reason and reset validation;
every old required case,24 cells and budget stays mandatory.
Qualification credit is0; there is no merge, tag or publication claim.
