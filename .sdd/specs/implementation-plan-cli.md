---
feature: implementation-plan-cli
tier: T2
approval: auto
---
# v0.2.7: Plan, context and gate integration
Goal: expose one consistent plan contract without breaking existing projects or blocking all intermediate development. Readers: users, agents and implementers. Status: requirements draft, 2026-11-03.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PLAN-CLI-001 | When plan-required mode is absent or disabled, the system shall preserve existing plan/context/gate behavior; when explicitly enabled, all three commands shall use the same validated JSON model, ignore Markdown plan contents/existence and report missing or invalid required planning inputs without silently falling back. | TEST-PLAN-CLI-001 |
| REQ-PLAN-CLI-002 | When checking plan consistency, the system shall accept not-started tasks only with structurally valid current bindings and reject any stale state, including dependency-derived staleness with matching own-spec hashes; when running `gate --changed`, it shall validate global plan structure and require current bindings and completion of changed-scope tasks and their transitive prerequisites, without blocking on stale tasks outside that closure; a full `gate` shall require every task in the effective configured/default scope to be complete. | TEST-PLAN-CLI-002 |
| REQ-PLAN-CLI-003 | When resolving changed scope or context in enabled mode, the system shall retain existing REQ/file impact, complete-spec/artifact selection and byte-budget rules, close over declared planning dependencies and every explicit owner of shared artifacts, and explicitly refuse unresolved ownership rather than omit required work. | TEST-PLAN-CLI-003 |
| REQ-PLAN-CLI-004 | When reporting planning results, the system shall expose consistent human-readable and JSON decisions with task/REQ IDs and reasons, use exit 0 only for the requested stage's success, exit 1 for conclusive invalidity such as malformed/unsupported plans or stale bindings, exit 2 for missing required inputs, unresolved scope or unavailable/unparseable evidence, and preserve direct/wrapper/installed-host parity. | TEST-PLAN-CLI-004 |
## PASS conditions and counterexamples
| REQ | PASS condition | Counterexample and expected result | TEST/command | Observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-PLAN-CLI-001` | Disabled mode matches the existing CLI; enabled commands agree on JSON regardless of absent/stale/malformed Markdown. | Missing enabled-mode JSON must not pass by reading an old Markdown plan. | TEST-PLAN-CLI-001 | Not run. |
| `REQ-PLAN-CLI-002` | Current A/B plan passes consistency; completed A permits scoped gate while untouched B is pending/stale; full gate waits for B. | Dependency-derived stale B fails consistency even if B's own spec hash matches; A depending on pending/stale X blocks scoped gate. A task's own full gate cannot establish completion. | TEST-PLAN-CLI-002; enumerate stage/state combinations | Not run. |
| `REQ-PLAN-CLI-003` | B→A context includes both complete specs and required artifacts within the exact byte bound. | Unknown changed-file ownership, missing prerequisite or oversized UTF-8 output: explicit incomplete refusal, no partial success. | TEST-PLAN-CLI-003 | Not run. |
| `REQ-PLAN-CLI-004` | Equivalent direct/wrapper/installed calls report the same IDs/reasons/verdict. | Bad JSON/unknown schema→1; absent plan/unknown scope/unparseable evidence→2; none becomes exit0 or differs by renderer/host. | TEST-PLAN-CLI-004 | Not run. |
Risk stages: contract=opt-in/stage policy; inputs=scope resolution; execution=shared evaluator; verdict=three-valued outcomes; history=no completion from views; integration=all entry points. No stage is waived.
Oracle: the stage examples above, existing disabled-mode controls and independent finite policy fixtures; passing a weaker selector is not a full-gate pass.
## Design
Extend existing `plan`, `context` and `gate` through one shared model/evaluator; no natural-language planner, external service or mandatory dependency. Enabled mode replaces Markdown dependency ownership with JSON; disabled mode retains the existing `REQ-SPECCTX-002` contract.
Bind changed-scope results to all reached tasks/prerequisites; independent untouched tasks do not block a scoped gate, but every required task blocks final readiness until complete. Keep evidence checks independent of a task's own aggregate gate to avoid a dependency cycle.
## Assumptions / risks
Exact subcommands/config key and JSON shape are design-stage decisions; pin them with direct/wrapper/host fixtures before lock. Planned new evaluation refusals use 1/2 without changing disabled-mode legacy exits.
No release authorization is added. Numeric input/output limits and cross-language impact boundaries require a pre-implementation spike; unresolved scope never succeeds. TEST-PLAN-CLI-001/003/004 retire these assumptions.
