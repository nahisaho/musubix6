spec: sha256:025edb593a1f14dfd2c1f9a5118ad2a3a2b0bdd6b7ac845abbd4129c4cf9c3c1
verdict: pass
open: 0

# Implementation-plan CLI findings

| ID | Severity | Where | Status |
| --- | --- | --- | --- |
| CLI-PREFLIGHT | S2 | Native rerun requires already-current TDD evidence; it cannot bless a weakened T2 test. | Closed |
| CLI-EXITS | S2 | Missing evidence2, stale evidence1, unparseable ledger2 and invalid hash chain1 are explicit. | Closed |
| CLI-LEGACY-ORACLE | S2 | Legacy plan text/exits and complete context payload are independently pinned before toggle comparison. | Closed |
| CLI-CLOSURE-ORACLE | S2 | Current A-to-pending-B binding, committed plan and A-only changed file exercise prerequisite closure. | Closed |
| CLI-AGGREGATE-ORACLE | S2 | Spec defines conservative basename matching, exact reason and pre-execution refusal; a valid sentinel script detects execution. | Closed |

Claude Sonnet 5.5 independently reviewed contract/native-state coupling and
regression adequacy on separate risk axes. The contract reviewer reported
CLEAN then CLEAN2 after the preflight/exit fixes and the small schema/guard
clarification. The oracle reviewer closed its findings and reported CLEAN.
Its initial objection to history-derived revalidation was withdrawn after
checking the existing state contract: any on-disk attempt matters, regardless
of authored status. No requirement was weakened to satisfy that objection.

Both reviewers read only their stated scope and executed no checks. The
contract reviewer did not deeply inspect native gate/context or the shared
core; the oracle reviewer did not prove fixture characterization evidence
through execution. Native fixture and production checks remain required.

Actual external spike `v027-cli-feasibility-rx4Q6v/report.json` records 33
Linux native calls on Node20/22/24 through source, wrapper and both installed
hosts, including unchanged-ledger zero-selection refusals. It does not prove
new planning commands. The four direct pre-implementation CLI regressions
failed assertions against the existing CLI in `v027-cli-initial-red.log`.
Installed planning-command/package parity belongs to the distribution
feature and has not run. No CLI implementation, gate or release pass is
claimed by this design review.

## Standalone compatibility design delta

The retained native-contract reviewer found an S2 compatibility regression:
guarding imports by command alone still broke disabled bare plan/gate on a
lone script. TEST-PLAN-CLI-005 confirmed an assertion Red before repair.
The reviewer accepted the new compatibility design conditional on an
all-or-nothing module-availability flag and differential config-policy cases.
The test now covers absent/false/malformed policy objects, BOM/UTF-8,
the exact1MiB bound and excess, in-root/escaping/dangling symlinks, and
partial/missing sibling bundles. At design approval these controls awaited implementation.
Oversized config is fail1, matching the existing shared JSON reader; the
reviewer's suggested exit2 for that case is not adopted because it would
change the existing contract. Unreadable inputs remain incomplete2.

## Implementation checkpoint review

CLI-STANDALONE | S2 | Missing optional siblings preserve proven-disabled legacy plan/gate; enabled or unsupported shapes refuse2. | Closed
CLI-HUMAN-ORACLE | S3 | Human status, task/REQ IDs and refusal reasons have independent literal assertions. | Closed
CLI-SYMLINK-ORACLE | S3 | In-root config symlink explicitly requires exit0 before comparing entry points. | Closed
CLI-PARTIAL-ORACLE | S3 | Valid enabled policy with a partial model-only bundle explicitly requires exit2. | Closed
CLI-POLICY-ORACLE | S3 | The finite policy table drives plan, gate and context through independent expected stages. | Closed

The retained native reviewer read the implementation's preflight/exit fixes,
trace missing-TEST mapping and standalone fallback, reporting CLEAN.
CLEAN2 was based on the reported unchanged production source and test-only
delta, without another reread, hash verification or execution. It did not
inspect the shared evaluator, context/scope implementation or distribution.

The context/scope/oracle reviewer closed its earlier implementation findings.
It subsequently read only final CLI004/005 assertion deltas, closed all four
non-blocking oracle gaps above and reported CLEAN2 without executing checks.
Enabled gate/context under the partial bundle are not separately repeated;
the reviewer accepted their shared unavailable-module guard and no-bundle
controls. Neither review establishes runtime or release evidence.

Actual final runtime,28-mutation, native Refactor and111 source/wrapper/both-host
feasibility reports are recorded in the existing CLI spec. The earlier18/19
mutation report's survivor and invalid first STATE setup Red remain historical
failures, not hidden passes. Packaged planning, own-project full gate, frozen
qualification and publication remain pending.

## Normal-shutdown followup

CLI-NORMAL-EXIT | S2 | Native normal dispatch and the wrapper's returned-child result retain0/1/2 through exitCode instead of forced runtime termination; early aborts remain unchanged. | Closed
CLI-GC-ORACLE | S2 | The synthetic V8 flag also stopped the repaired Node22 natural path. Retain all failed histories and replace that unsound verdict with actual exit/reallyExit observation, preserving every public state/entry/deadline. | Closed
CLI-OBSERVER-VACUITY | S2 | Both exit7 positive controls, unique outside-project startup/call markers and the final all-row forbidden-call assertion prevent a missing observer or first-row-only mutation verdict. | Closed
CLI-OBSERVER-WORDING | S3 | The terminal design now says observes, not stresses; wrapper-only and internal-native-reference limits are explicit. | Closed

Both retained Claude Sonnet5.5 reviewers read the actual proposed observer
fragment and terminal design. Their final CLEAN2 reviews confirmed the
unchanged actual test/native/wrapper hashes, corrected wording and report
summaries for the unfiltered20/20-per-major matrix and12 isolated mutations.
They executed no tests and did not independently verify every state label,
native Red/Green, stability, installed-host or diagnostics log. Those limits
are not replaced by a blanket integration-review claim.

The final test is the exact reviewed fragment, not a weaker post-review
version. Its actual original-wrapper reversal has native assertion Red and
same-body restored Green; raw mutation logs independently retain all four
relevant state labels for each reversal. Bounded stability, scoped diagnostics,
111 source/source-installed-host calls and seven shared native Refactors
are recorded in the existing CLI spec. The default-disabled configuration
is unchanged. Own-plan re-adoption, canonical reference/human approval,
original full gate, same-head hosted checks, frozen qualification and
publication remain pending at this followup checkpoint.

## v0.2.10 candidate delta

| ID | Severity | Where | Status |
|---|---|---|---|
| V0210-HELP-OPERANDS | S2 | `sdd.mjs:8133` omitted operands prevented command-help discovery | Closed |
| V0210-SHARED-INPUTS | S2 | `sdd.mjs:6987` repeated shared native-ledger parsing | Closed |
| V0210-CANONICAL-HASH | S2 | `sdd.mjs:840` canonical hash followed compatibility variants | Closed |
| V0210-HISTORY-HASH | S2 | `sdd.mjs:7060` repeated identical historical TEST comparisons | Closed |
| V0210-DIAGNOSTIC-HELP | S2 | `sdd.mjs:8144` global help bypassed diagnostic mixed-option refusal | Closed |

Independent delta reviewer `bac4e213-1e8f-4318-8cc0-3c71e9ee83c4`
completed two clean rounds for the preview memo and two for the final diagnostic
guard. The oracle-global concern was resolved by checking that every consumer
explicitly recomputes its own metadata. The preview comparator is scoped to one
TEST inspection; ordinary stages retain fresh matching and post-command inputs.
Reviewers did not independently verify every execution log.

Session28d27536 `files/v0210-*` references in the specification are session-local,
unversioned evidence. The final selected suite passes31 tests with zero skips;
Node20/22 each pass all five changed CLI regressions. The actual candidate tarball
passes those five on each installed host on Node24. The mutation report retains26
isolated assertion detections with exact restoration and affected passing controls.
Native assertion Reds/Greens remain append-only in `.sdd/tdd.jsonl`.

This verdict covers the reviewed candidate delta, not full-project readiness.
Full npm checks are nonpassing/incomplete; exact Python/Rust providers, cleanup
and release-readiness fixture results are not waived. Root JavaScript diagnosis
is incomplete because the required root ESLint flat config is absent.
Existing full-scope tasks/receipts and human release locks are not certified or
refreshed by this review. Frozen qualification and publication remain unauthorized.
The final caller-bounded full gate ended137 after180.07s without a JSON verdict;
its terminal cause is unknown, and it supplies no passing gate evidence.
