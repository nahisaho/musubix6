spec: sha256:2fd2e3453b97873e49cd4b6c01a5784951f4e7cf07efcb46f798a6645715a2fd
verdict: pass
open: 0

# Implementation-plan evidence findings

| ID | Severity | Where | Status |
| --- | --- | --- | --- |
| STATE-LOCK | S2 | State spec: exclusive task-bound lock, explicit busy/abandoned refusal, manual recovery only. | Closed |
| STATE-LIMIT | S2 | State spec: explicit incomplete overflows, bounded prefixes, compact refusals where permitted, no pruning. | Closed |
| STATE-PRECEDENCE | S2 | State spec: deterministic reference/artifact and structural-staleness tie rules. | Closed |
| STATE-CAP-ORACLE | S2 | State tests: valid 4095/4096 controls and a valid linked 4097th receipt. | Closed |
| STATE-POST-EVENTS | S2 | implementation-plan-evidence.mjs:376: invalid post-run events are not copied into immutable failure receipts; valid verification recovers without pruning. | Closed |
| STATE-OWNER-JSON | S2 | implementation-plan-evidence.mjs:153-156: bounded JSON/UTF-8 and null-safe owner validation return incomplete2 and preserve malformed or changed locks. | Closed |

Claude Sonnet 5.5 independently reviewed the final state design and focused
regressions. After finding and resolving the rows above, the retained reviewer
reported CLEAN then CLEAN2 on unchanged final spec/test inputs. The second
check estimated the genuine 4096-receipt fixture at about 8 MiB from the
receipt schema, below the 64 MiB evaluation budget; this was not executed.
The reviewer inspected the state spec, CLI contract where relevant, and the
four state tests, not production implementation. This initial review did not
establish a production pass.

Actual external spike `v027-state-feasibility-rBzN7b/report.json` records native
Red/Green/refactor and zero-selection refusal on Node20/22/24, unchanged ledger
on refusal, exclusive receipt creation and hash-derived task-name controls.
Initial direct state tests failed four assertions against explicit failing
stubs. Native Reds/Greens and the following production checks subsequently ran.

## Implementation review and observed checks

The core-checkpoint implementation source SHA256, before native-integration fixes, is
`91e59bdfd403513f35bd45f1fdecea474f7bd4a58fdc29abe1154fad7873cfce`;
test SHA256 is
`2ca0aead3d6c7edeaffd92f63c7d5d425ca1fcfdc55f13e4f57e8bd5c5bc9b14`.
Claude Sonnet 5.5 read the state engine and path-containment helper and found
STATE-POST-EVENTS. The fix followed a native assertion Red/Green. A separate
native assertion Red/Green fixed malformed lock-owner exceptions. The reviewer
read those fix paths and their new STATE003/004 test blocks and reported CLEAN.
CLEAN2 confirmed the unchanged fix based on that static review and the reported
checks; it was not another full source/test reread or an independently executed
validation. The final observed-evidence additions leave the EARS requirements
unchanged.

Actual external report `v027-state-mutations-GFVpiK/report.json` records
27/27 isolated assertion detections with restored exit0 controls, unchanged
source hashes and exact isolated restoration. Report
`v027-state-validation-iRDKvo/report.json` records 8/8 model+state tests on each
of Node20/22/24 with zero skipped/cancelled/TODO and PASS from isolated
JavaScript diagnostics. Native `.sdd/tdd.jsonl` retains the genuine
Red/Green/Refactor history, including historical moved-oracle warnings; the
mutation report, not a fictional new initial Red, demonstrates the strengthened
boundary assertions can fail.

Remaining limits of that checkpoint: unit adapter only; no native CLI/gate or installed-host
integration, full-project gate, release qualification or publication checked.
Lock-release failure may leave a retained success receipt whose path is not
returned with the incomplete refusal; the occupied lock still refuses evaluation
until explicit owner-confirmed recovery. No history is deleted automatically.

## Native-integration fix review

STATE-NATIVE-FAIL | S2 | Native preflight now preserves conclusive exit1 without executing Refactor. | Closed
STATE-NATIVE-UNKNOWN | S2 | Unknown TEST bindings and prerequisite fingerprints remain incomplete2, not false conclusive staleness. | Closed

The retained state reviewer inspected the narrow fixes and reported CLEAN.
CLEAN2 accepted the corrected fixture ordering and reported isolated
classification Red/Green, explicitly without rereading the source, checking a
source hash or executing validation. It did not review CLI adapter mapping or
diagnostics. The initial dependency-ordering fixture failure is excluded from
behavioral Red evidence, not relabeled as a pass. Current native integration
evidence and snapshot limits are recorded in the existing feature spec.
