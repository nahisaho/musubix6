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
Qualification credit is0; there is no merge, tag or publication claim.
