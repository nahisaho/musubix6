---
feature: implementation-plan-evidence
tier: T2
approval: auto
---
# v0.2.7: Evidence-bound task state
Goal: keep plan progress consistent with current specifications, dependencies and observed verification, not agent completion claims. Readers: users, agents and implementers. Status: requirements draft, 2026-11-03.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PLAN-STATE-001 | When evaluating tasks, the system shall distinguish not-started, in-progress, blocked, replan-required, revalidation-required and complete, derive completion from valid required evidence and dependencies, and refuse a complete claim supported only by an authored status. | TEST-PLAN-STATE-001 |
| REQ-PLAN-STATE-002 | When current whole-spec-file SHA-256 differs from a stored binding, the system shall derive renewed-planning/verification states for every task using that specification and all transitive dependents, without invalidating tasks outside that closure; returning to complete shall require updated plan bindings and newly executed declared verification bound to the current inputs, not merely a hash refresh. | TEST-PLAN-STATE-002 |
| REQ-PLAN-STATE-003 | When checking an implementation task, the system shall require resolvable REQ/TEST mappings and current successful evidence under the existing TDD/trace contract, bind it to current task/spec/artifact/dependency inputs, and reject missing, stale, failed, required-skipped or unparseable evidence. | TEST-PLAN-STATE-003 |
| REQ-PLAN-STATE-004 | When updating or evaluating progress, the system shall preserve existing evidence, derive invalidation after relevant plan/artifact/dependency changes without changing authored files, and keep pure status/evaluation reads free of persistent writes; documentation-only tasks shall require explicit successful verification rather than a status claim. | TEST-PLAN-STATE-004 |
## PASS conditions and counterexamples
| REQ | PASS condition | Counterexample and expected result | TEST/command | Observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-PLAN-STATE-001` | A completes only with current evidence; B depending on incomplete A is blocked. | Write `complete` while no evidence exists: not complete; no automatic testing or plan mutation. | TEST-PLAN-STATE-001; finite state/transition table | Not run. |
| `REQ-PLAN-STATE-002` | Changing S1 invalidates every S1 task and A→B→C; independent D using S2 retains valid completion. | Retain B/C completion after S1 changes, rewrite only its stored hash, or invalidate D: regression fails. Fresh bound verification restores completion. | TEST-PLAN-STATE-002; bounded graph enumeration | Not run. |
| `REQ-PLAN-STATE-003` | Current passing required tests satisfy their declared task checks. | Reuse an old artifact hash, omit one required TEST, skip it or supply a loader failure: not complete. | TEST-PLAN-STATE-003 | Not run. |
| `REQ-PLAN-STATE-004` | Re-evaluation is read-only and old failures remain retained; explicit current doc checks can complete a doc task. | Delete failed history, change task conditions but reuse old completion, or mark docs done with no check: refuse completion. | TEST-PLAN-STATE-004 | Not run. |
Risk stages: contract=state precedence; inputs=current bindings; execution=actual verification receipts; verdict=unknown is not complete; history=no overwritten failure; integration=shared state for CLI/gates. No stage is waived.
Oracle: define the complete finite precedence/transition table before coding; enumerate bounded graphs and stale-input cases independently of the implementation.
## Design
Reuse existing trace/TDD evidence, including honest characterization/refactor limitations; do not claim new mechanical enforcement of test quality or mutation coverage. Task input fingerprints exclude generated status output to avoid circular completion hashes.
Expose a pure internal evidence evaluator before CLI integration. An agent updates the plan after spec changes and each verified task; read-only CLI evaluation derives staleness from current/stored bindings. Exact receipt format, documentation checks and stale-state precedence must be resolved by spike/design review before lock.
## Assumptions / risks
Task-level evidence is not a full-project gate, release qualification or human publication approval. Preserve existing approval policy; history tamper resistance is limited to the existing ledger and Git contracts.
State semantics require TEST-PLAN-STATE-001/004 and finite enumeration before implementation; evidence interoperability requires TEST-PLAN-STATE-003. No tests, Red/Green or mutation results are claimed yet.
Whole-file hashing is deliberately conservative: even a typo changes every task bound to that spec file; different REQs in the same file are not considered unrelated. Unrelated means outside the spec-binding/dependency closure; TEST-PLAN-STATE-002 pins this boundary.
