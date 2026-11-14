spec: sha256:ceb19c1a6b51ef2d94a0a6b9cdeeefdc54c656513acee7d00d414ac7c47ee7fd
verdict: pass
open: 0

# Ledger-compaction review

## Current transition-release contention: verified local repair

The whole129-task current proof at local484d379 stopped after47 successful
tasks. Its complete declared ledger-module check passed, but native004 then
failed its actual concurrent-writer assertion, exit2 instead of0. Retain
failure receipt7c9402ea614ab1c0c77dc8001c1cf80e13ae22bfdfcb22017c95c46bdc677a94
and all preceding receipts. A single unmodified full-output diagnostic
passed1/1; this is FLAKY suspected, not a successful retry or repair.

RELQ-LEDGER-CONCURRENT-APPEND|S2|.github/skills/lean-sdd-tdd/scripts/sdd.mjs:1365|closed

The real two-process probe ledger-transition-release-0p0o28/report.json
deterministically pauses a contender after stat while the real owner
normally removes its own published transition. Owner0/contender2 reports
ENOENT opening tdd-transition.lock; production was unchanged.
The new015 regression additionally forces release after open and before
descriptor validation, requires both real writers to append once, and
enumerates15 accepted/refused policy rows against the actual storage class.
These include repeated alternating transient reads, the existing25ms
backoff and30000ms deadline, with a separate iteration cap bounding a broken
clock/backoff. Arbitrary I/O/JSON/ownership failures must still refuse;
retrying a transition observation is never successful acquisition.

Independent reviewers f3f85f22-163e-4a79-a102-d11ab84f10ea and
0a673492-a853-4224-a392-02eef79a1b02 returned pre-lock CLEAN. The latter
first correctly found artificial one-iteration deadline coverage; it was
strengthened before locking or formal Red. The SDK genuinely auto-locked
the above spec after those reviews. Native015 Red415ms then failed its own
before-open expected-success assertion, not a setup/barrier failure.
At that preimplementation point production, Green, mutations and final
reviews were pending; the actual current results follow.

The task plan retains129 tasks and all old receipt heads, adds015 to its
existing ledger owner, and corrects that task's leftover Linux20 execution
wording to the already human-approved Linux22/24 policy. Windows20/22/24
controls remain required. Canonical SDK bytes/reference, current whole
proof/gate/CI and exact seven-artifact renewal must follow the repair.
Qualification remains0/2 and no publication is authorized.

The current native Green passes921ms: both actual process interleavings
retain all original bytes and exactly two appends, and all15 policy rows
accept/refuse as declared. The only production change is an optional internal
snapshot-change code on the existing two strict readFile refusals, forwarded
through LedgerError, and a narrow ENOENT/tagged-change catch when a writer
inspects the volatile transition claim. The existing exclusive publication,
owner parsing,25ms wait and30000ms deadline remain. Other ledger reads and
arbitrary I/O/JSON/owner/metadata failures do not gain retries or defaults.

Seven isolated retry/tag-producer/tag-consumer/I/O-refusal/acquisition/
backoff/deadline sensitivities each passed baseline, detected the intended
native assertion, restored exact bytes/modes and passed again. Report
linux-supported-mutations-gelndr/report.json SHA256:
a6f8a9a1004ba5c8c76383ba23714e083eba9e9bbff115af94ba4746319c743d.
Root tracked/helper inputs and complete logical ledger were preserved.
The complete ledger/runner/root-release/host command passed51/51 with zero
skips,113341ms. Actual supported Node22 passes the new015 control1/1,
zero skips,1345ms. JavaScript diagnostics01 passes. All19 shared native
tests pass genuine refactors, including the original004 concurrent writers,
008 paused reclaimers and all source/archive/flush/import/closure controls.
Both independent reviewers returned postimplementation CLEAN in two rounds;
the risk reviewer verified source/test and mutant-log hashes.

The preimplementation binding/check driver retained129 known fingerprints
and old receipt heads, adopted one measured binding, and observed FAIL:
82 complete,9 replan-required,38 revalidation-required. It is not current
whole-plan success. The bounded concurrency defect is locally verified
closed, not a flake dismissed by rerunning. Its original failure and
unmodified passing diagnostic remain. The changed two canonical SDK files
still need a genuine committed-reference renewal and exact human release
unit approval; a local source preparation commit is not readiness. Fresh
whole129-task proof, full gate, same-head Linux22/24 and Windows20/22/24 CI,
and two unchanged complete20-cell runs remain pending.

## Windows amendment: reviewed implementation and actual native CI

The current verdict covers the specification and changed implementation.
Both retained reviewers completed two consecutive fresh whole-assigned-scope
post-implementation static CLEAN rounds. Neither executed tests.
Current full-scope task verification, a new full gate, frozen qualification
and publication remain pending. Historical successful
evidence below applies to the earlier source freeze, not current readiness.

Independent retained reviewers a5379e68-15d0-4bd7-9b87-bfb2587e01c1
(storage/state) and877ef8ec-d754-4cb2-80ac-edef246478f7 (integration/test)
returned pre-lock CLEAN for the current spec after the latter identified
Windows drive-letter paths in the test helper's `--import` argument.
That finding is fixed before formal Red by the existing pathToFileURL helper;
every shared caller benefits. Neither reviewer executed tests.

Authentic failed product CI43226374480 and diagnostic run43228207529 are
retained separately. The latter proves real `r+` and `rs+` directory flushes,
not a product repair. Formal native TEST014 Red fails the intended Windows
valid-handle assertion (196ms), then unchanged-test Green passes (855ms).
The only production behavior change is directory-open access: Windows uses
`r+`, other platforms retain `r`; fsync, finally-close and refusal are intact.
SDK SHA256:251303cb76dc669b237463df58ac2dfc1f93fccc161453007537c5ccbab37270.
Test SHA256:b8efd9f1d86b8a86890ccf431b0fb68c1923ab6b1749a0312c504ff46d5ca804.
Windows workflow SHA256:0e5cea8adf8c995517b64c80eba4392dcabfb2005728ac70b9280466d82a78de.

Repair commitffff1a7893a41d9b8ea0b50ddc4837a663ce23a3 is pushed without
force. Actual same-head Windows43236541000 passed all Node20/22/24 jobs:
source controls, focused014, both copied hosts and lone standalone script.
Same-head Linux43236540939 also completed SUCCESS. Retained session logs:
ledger-windows-ci-ffff1a7.log SHA256
e416a8d42d75a0ba53e42395e3a861d6421fa3b264b07cf0bdbdc9fd1cf6ed80;
ledger-linux-ci-ffff1a7.log SHA256
81c5044a8845bbb64c8817b74e689b7a96cf1f6adaab2c5060e5d91e5f0e76ef.
These are development CI results, not full Windows qualification or either
required complete frozen Linux run.

Actual TEST014 executes eight valid modeled rows and140 refused error rows,
two real plain/oversized appends and two real injected-flush refusals.
Those injected failures occur during lock acquisition, not append/rotation
flush boundaries; retained-prefix success is not claimed as that later proof.
Five isolated mutants are assertion-detected and each byte-exact restoration
passes: Windows read-only mode, POSIX read/write mode, omitted directory
flush, swallowed directory error and swallowed file error. The report is
ledger-windows-flush-mutations-2hnfdu/report.json in session artifacts.
The source ledger/runner selection passes16/16 with zero skips: twelve ledger
tests001-011/014 plus four runner tests, not fourteen ledger tests.
Actual native refactors001-013 additionally pass, including012/013 in the
release test file. Five other shared-code warning tests also pass genuine
native refactors. JavaScript diagnostics PASS. Both generated-cost tasks
receive fresh real successful receipts after the generator; this does not
establish full current plan consistency.

The pre-implementation full plan check is retained as FAIL:128 complete,
only TASK-LEDGER-COMPACTION replan-required against its old history/definition.
All129 binding fingerprints were measured with no required binding patch.
Its old genuine history-head receipt pointer is retained and authored status
remains in-progress until fresh task verification; no historical
receipt is represented as current completion.

No directory flush is skipped and no actual I/O error is ignored.
ACL-restricted/non-admin scenarios, other Windows filesystems and power-loss
behavior are not inferred from hosted-runner API success. Pre-existing
temporary-file residue or live-PID lock behavior after an I/O failure is not
changed or qualified by this repair.

## 2026-11-12 remediation source freeze

The two retained independent Claude Sonnet5.5 reviewers completed two consecutive
whole-assigned-scope static clean rounds after the final fixes. State reviewer
a5379e68-15d0-4bd7-9b87-bfb2587e01c1 covers storage, ownership, recovery,
Git reconstruction, multiset retention, gate snapshots and tests001-013.
Integration reviewer877ef8ec-d754-4cb2-80ac-edef246478f7 covers the SDK import
contract, logical/physical release adapters, tests006/010-013, package inclusion
and README parity. Earlier partial reviews are not counted as clean rounds.
Neither reviewer executed tests; execution below is the parent's evidence.

Frozen SDK SHA256:
3141c031d4b956d05e4474e2570b9b70b21ee649f460679b8f40970b7dbbe8f5.
Frozen release-adapter SHA256:
8f85684dbf4372a2cf1bb9db08473463752e0235fbf4f2b9644e074ee8990289.

| ID | Stage | Status and evidence |
| --- | --- | --- |
| LC-RELEASE-READ | Integration/verdict | Closed: complete logical bytes drive catalogue, archived receipt membership, retained prefix and no-change digests. TEST011-013 pass; invalid evidence rejects and restored controls accept. |
| LC-RECLAIM-RACE | Execution | Closed: serialized transition claim; genuine TEST008 Red/Green, detected bypass mutant and restored PASS. |
| LC-GATE-ARCHIVE | Evidence history | Closed: gate snapshots all ledger inputs and aborts before a second check restores a corrupted archive. TEST009 and restored snapshot mutant pass. |
| LC-PRESERVED-SYMLINK | Integration | Closed: canonical SDK URL covers identity, all six imports and native provenance. Renewed TEST010 Red-03/Green and canonical-location mutant/restoration pass. |
| LC-EXPECTED-ROOT | Trusted inputs | Closed: caller's expected output binds the no-change fixture. TEST013 Red-03 uses a real independent fixture and genuine receipts, then Green and detected/restored root-binding mutant pass. The earlier metadata-only mismatch is not acceptance-hole evidence. |

Actual final native refactors001-013 all pass. Linux Node20.20.2/22.23.3/24.22.1
each execute thirteen required controls, including real npm pack, offline
installation, the package wrapper and both init-copied host readers, with zero
required skips. Node20 lists24 unrelated name-filtered release tests as skipped;
none is claimed as executed or passed in that selection.
The isolated mutation report records20 assertion-detected mechanisms with
restored passing controls and final13/13 PASS; assertion text is retained in
each stdout log, while the JSON report retains output hashes.

The complete actual `npm test` now passes1225/1225, fail0, skipped0,
cancelled0, duration2190434.148683ms, with the corrected installed native-tool
environment and bytecode generation disabled. Full logs are retained as
`ledger-compaction-remediation-full-npm.stdout.log` and `.stderr.log`.
This is the full test suite, not a successful full development gate.

The human explicitly accepted the shown exact seven-artifact unit plus the
release helper hash through ask_user, for development evidence refresh,
task revalidation and the full gate only. No push, frozen qualification restart,
tag or npm publication was approved. The generated cost log remains$1082.32.
The129 current planning receipts and the final full gate remain pending at
this freeze. The original failed gate and all failed attempts remain intact.

Coverage limits remain explicit: metadata/logical limits, gzip-bomb cases,
corrupt Git baselines, archive-link crash points, actual Windows/macOS and
filesystems without hard links are not validated here. Copied hosts exercise
readers, not host-specific append/compact. Interrupted transition ownership
requires manual investigation by design. These are not passing results or
frozen qualification credit. Qualification remains paused at0/2.

## Historical remediation design approval, not implementation approval

Both retained independent Claude Sonnet5.5 reviewers inspected the bounded
export/adapter design and counterexample closure before production changes.
State reviewer a5379e68-15d0-4bd7-9b87-bfb2587e01c1 and integration reviewer
877ef8ec-d754-4cb2-80ac-edef246478f7 confirmed DESIGN CLEAN for exact SHA256
cb699a6aff490dc5cc426776c35409e8ef0426f0387cbf62b0abc2e274a76b26.
Neither ran tests or issued an implementation CLEAN. TEST-LEDGER-010 through
013 are authored before the fix; actual expected-assertion Reds remain required.
Their specific error expectations must not be widened to arbitrary exceptions.
At that phase, the failure/open count described the outstanding implementation
finding below; the design-only approval did not close it.

## Historical first requested implementation review and failed full gate

At this first failed gate, the implementation had not received a whole-diff
CLEAN verdict or two consecutive clean implementation-review rounds.
Updating a review record alone did not renew the specification approval.
The later source-freeze section above records the actual closure and reviews.

| ID | Severity | Where | Status |
| --- | --- | --- | --- |
| LC-RELEASE-READ | S2 | scripts/release-qualification-cells.mjs:212-217,294-295,340,368,428,585-589 | Closed: full-logical/state correction and genuine tests recorded above. Historical first-gate status was unresolved because history and hashes covered only the active tail; that failed gate remains retained. |
| LC-RECLAIM-RACE | S1 | .github/skills/lean-sdd-tdd/scripts/sdd.mjs:1318-1400 | Closed in the bounded ownership-code review: acquisition, reclamation and release serialize through an atomically published transition claim. |

Reviewer a5379e68-15d0-4bd7-9b87-bfb2587e01c1 inspected transition and
ownership code only, not TEST-LEDGER-009 or the full diff, and ran no checks.
It confirmed the original race is closed with high confidence. Hard-link
support is required; interrupted transition ownership can require manual
investigation. Release-error masking was a nonblocking suggestion, not a
reproduced failure.

Reviewer 877ef8ec-d754-4cb2-80ac-edef246478f7 confirmed the raw-tail finding
remains open and inspected both README deltas and package inclusion. The
development-only commands and Linux/Node24 limitation agree across languages.
It did not re-inspect the snapshot correction or TEST-LEDGER-009 and ran no
checks. Neither review establishes Windows or Node20/22 execution.

The actual full `sdd.mjs gate` completed with exit 1. Its retained log is
`ledger-compaction-requested-full-gate.log` in the session artifacts. It reports
stale CI and human release-qualification approval locks, stale planning
bindings/verification inputs, and TEST-LEDGER-008 changed since its native
Green. Trace has 144 requirements and zero errors; the logical ledger has
3886 entries with an intact chain.

Both automatic npm-test attempts failed. Attempt 2 reports 1221 tests:
1064 passed, 46 failed and 111 skipped. Its full output is retained at
`.sdd/check-output/attempt-oC2FI4/stdout.log`, with the check receipt alongside
it. Python and Rust diagnostics are among the failures; the summary alone
does not establish the cause of every failure. The earlier focused results
remain 9/9 ledger regressions and 19/19 legacy snapshot/flaky controls, with
zero skips in those selections, not a substitute for this failed full run.

Release qualification, tags and publication remain paused. No readiness or
completion claim follows from these reviews or this gate execution.

## Transition-ownership correction design

Independent Claude Sonnet5.5 reviewer a5379e68-15d0-4bd7-9b87-bfb2587e01c1
confirmed the exact current specification hash and no blocking design flaw.
It identified the paused-reclaimer/live-successor race in the initial code;
TEST-LEDGER-008 reproduced it as a genuine native assertion Red before this
correction. The reviewed transition-claim design serializes acquisition,
reclamation and release; none may bypass it. Waits for live local transition
owners are bounded; dead, foreign and unknown claims refuse without deletion.
Transition release must verify its own nonce. Read-only immediate refusal
during a transition is the chosen conservative contract, not a missing PASS.

An interrupted claim requiring investigation is an explicit availability
limit in the design, not an unresolved permission to steal or delete it.
This section supports the design lock only: the correction, its native
Green, detected/restored mutation and clean implementation reviews still
have to be completed. The reviewer performed no execution.

## Concrete storage-design refinement

Independent Claude Sonnet5.5 reviewer ledger-design-refinement read the exact
current specification and found no blocking requirement/design inconsistency.
It did not inspect the test module or SDK, because it searched for the test
at the worktree root rather than its scripts path. This follow-up therefore
supports the design refinement only, not a second test review or execution.
The original six requirement rows and independently reviewed regression
contract remain unchanged.

Nonblocking implementation obligations: retain staged bytes until commit and
republish missing blobs from validated staging during recovery; consider crash
points before blob publication and final cleanup; remove the lock directory
last, after the exclusive claim and unchanged-owner recheck. PID reuse, an
interrupted owner initialization or reclaim claim, and metadata growth beyond
the explicit1MiB cap must refuse rather than guess or steal. These are known
availability limits, not permission to erase unknown locks or ledger history.
Actual mutation, recovery, concurrent-writer and distribution evidence remain
required before completion. No release or publication authorization is granted.

Independent reviewer: ledger specification rubber-duck,
agent 2912f318-19a8-4b93-a2a7-6bf22f2ea190, final response through turn 3.

| ID | Severity | Where | Status |
| --- | --- | --- | --- |
| LC-OWNER | S1 | Design: lock ownership | Closed: host/PID/nonce; no mtime-only stealing |
| LC-MERGE | S1 | Design: immutable segments | Closed: new segments may represent permitted merge rechaining; existing blobs stay immutable |
| LC-BASELINE | S1 | Requirement 005 | Closed: both baseline and working tree use full logical history |
| LC-BOUNDARY | S1 | Requirement 002 | Closed: oversized events remain intact |
| LC-READ | S1 | Requirement 003 | Closed: readers refuse active foreign writer/recovery and mixed snapshots |
| LC-EXIT | S2 | Design: refusal classes | Closed: unresolved storage exits 2, proven integrity mismatch exits 1 |

The independent review concluded CLEAN for the exact specification above.
This is specification review only, not implementation review, native TDD evidence,
plan completion, release qualification or publication approval.
