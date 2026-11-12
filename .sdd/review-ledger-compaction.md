spec: sha256:ab5afb1e73d39d1fe9f7f36054450f6c5ae9fe575bc1608786852772536d4d52
verdict: pass
open: 0

# Ledger-compaction review

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
