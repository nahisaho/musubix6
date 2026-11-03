spec: sha256:46060ea10432968cc8cadcdbcca8a1f116097823243dba825231ded60b5a5047
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
