---
feature: implementation-plan-contract
tier: T2
approval: auto
---
# v0.2.7: Implementation-plan contract
Goal: let agents author one authoritative, reviewable implementation plan that the CLI validates before execution. Readers: musubix6 users, agents and implementers. Status: requirements draft, 2026-11-03; not implemented or locked.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PLAN-MODEL-001 | When plan-required mode is explicitly enabled, the system shall require `.sdd/implementation-plan.json` as the sole authoritative plan, with a supported schema version and a feature/task hierarchy; absent, malformed or unsupported input shall produce an explicit refusal without creating a replacement. | TEST-PLAN-MODEL-001 |
| REQ-PLAN-MODEL-002 | When validating a plan, the system shall require unique feature/task IDs, exactly one owning feature per task, resolvable REQ references and at least one task for every non-deferred REQ in the effective scope; scope shall come from project configuration, default to all current specification features and include declared prerequisite features, not be narrowed by plan JSON. Every task shall be required; only REQs bearing the existing specification-level `(deferred)` marker may be excluded and shall be reported. | TEST-PLAN-MODEL-002 |
| REQ-PLAN-MODEL-003 | When validating dependencies, the system shall reject unknown references, self-dependencies and cycles at both hierarchy levels, preserve declared cross-feature prerequisites and report the blocking IDs; independent tasks shall remain independent. | TEST-PLAN-MODEL-003 |
| REQ-PLAN-MODEL-004 | When accepting a task definition, the system shall require its scope, owned artifacts, completion conditions, verification references, whole-spec-file hashes and dependency bindings, and reject paths escaping the project root, including symlinks; shared artifacts shall be allowed with explicit owners and changes shall reach every declared owner. | TEST-PLAN-MODEL-004 |
## PASS conditions and counterexamples
| REQ | PASS condition | Counterexample and expected result | TEST/command | Observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-PLAN-MODEL-001` | Enabled mode accepts one valid schema; disabled mode needs no JSON. | Missing file, truncated JSON or unknown schema: refuse, no writes or fallback to Markdown. | TEST-PLAN-MODEL-001 | Not run. |
| `REQ-PLAN-MODEL-002` | R1 maps to A/B and R2 to B; every active REQ in configured/default scope and prerequisites is covered. | Duplicate A, unknown R9/feature, missing R2, plan-only deferral/optional task, omitted scoped feature or one task owned by two features: refuse. | TEST-PLAN-MODEL-002 | Not run. |
| `REQ-PLAN-MODEL-003` | A precedes B; independent C remains runnable. | A→B→A, A→A or missing X: refuse with IDs. | TEST-PLAN-MODEL-003; enumerate bounded dependency graphs | Not run. |
| `REQ-PLAN-MODEL-004` | In-root artifacts and matching spec/dependency bindings validate; one file may explicitly belong to A and B. | Omit verification/condition/hash, fail to reach B for the shared file, use `../outside` or an escaping symlink: refuse. | TEST-PLAN-MODEL-004 | Not run. |
Risk stages: contract=schema/scope ownership; inputs=IDs/paths/hashes; execution=bounded parsing; verdict=no missing-input success; history=versioned bindings; integration=one contract shared by all commands. No stage is waived.
Oracle: the four clauses above and independently authored valid/invalid fixtures; never derive expected acceptance from the parser being tested.
## Design
Agents author content; the CLI validates, never infers tasks from natural language. JSON is authoritative; Markdown and CLI rendering are views, not a second plan.
Expose a pure internal validator for unit fixtures before CLI integration; use one model for feature/task edges, REQ ownership and fingerprints. Do not infer dependencies from display order. Detailed schema/config names and resource limits require an isolated spike before implementation and spec lock.
## Assumptions / risks
Single-writer local files; no Issue sync, external service, automatic migration or new mandatory dependency. Git retains authored revisions and existing evidence is preserved; concurrent editing is out of scope, not a safety guarantee.
Project configuration is a trusted policy input: narrowing configured scope or disabling planning requires visible policy review, not a plan-only edit. Preventing an actor from rewriting configuration/Git history is outside this local tool's guarantees; disabled mode does not imply planning passed.
Acceptance uses Node20/22/24 and both installed hosts. Existing `plan.md` stays supported in disabled mode; new behavior is gated by explicit configuration. TEST-PLAN-MODEL-001/004 retire compatibility/path assumptions.
