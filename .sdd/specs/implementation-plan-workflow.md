---
feature: implementation-plan-workflow
tier: T2
approval: auto
---
# v0.2.7: Agent workflow and distribution
Goal: make specification-linked planning usable and consistent in Copilot CLI and Claude Code, from requirements through verified completion. Readers: users, agents and maintainers. Status: requirements draft, 2026-11-03.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PLAN-FLOW-001 | When using planning-enabled SDD skills, the agent workflow shall create or update the implementation plan from the current specifications before implementation, follow dependencies, update the plan after each task's implementation and verification, and revise affected plans after specification changes. | TEST-PLAN-FLOW-001 |
| REQ-PLAN-FLOW-002 | When documenting or distributing the workflow, both READMEs and both installed hosts shall expose the same opt-in, planning stages, staleness and evidence rules, while preserving existing disabled-mode usage; source and packaged entry points shall include all required helpers and fixtures. | TEST-PLAN-FLOW-002 |
| REQ-PLAN-FLOW-003 | When describing progress or readiness, the skills shall distinguish plan consistency, task verification, full-project gate, frozen release qualification and human publication approval, retain counterexamples and observed evidence, and never describe pending/skipped/unknown checks as completed. | TEST-PLAN-FLOW-003 |
## PASS conditions and counterexamples
| REQ | PASS condition | Counterexample and expected result | TEST/command | Observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-PLAN-FLOW-001` | Both hosts instruct spec→plan→dependency-ordered implementation→verification→plan update. | Instructions omit spec-change replanning, post-task updates or completing prerequisites: fixture rejects. | TEST-PLAN-FLOW-001 | Not run. |
| `REQ-PLAN-FLOW-002` | Source, extracted tgz and initialized Copilot/Claude assets work on Node20/22/24 with matching contracts. | Drop a planning helper, wrapper option or one host's opt-in instructions: installed control fails. | TEST-PLAN-FLOW-002; real package/host controls | Not run. |
| `REQ-PLAN-FLOW-003` | Documentation requires actual Red/Green, bounded restored mutations and separate release approval where applicable. | Claim plan-check success is full gate/release readiness, or claim unrun tests passed: fixture rejects. | TEST-PLAN-FLOW-003 | Not run. |
Risk stages: contract=workflow instructions; inputs=current specs/plan; execution=agent adherence plus executable controls; verdict=distinct completion levels; history=observed evidence only; integration=source/hosts/npm/docs. No stage is waived.
Oracle: the agreed nine interview decisions, preceding three planning specs and independent source/package/host fixtures. Text checks alone do not prove an agent will obey.
## Design
Update lean-sdd-tdd, lean-agentic-coding, sdd-spec-interview and sdd-reverse-spec only where their workflow owns a planning step; use shared CLI rules rather than duplicated status logic.
Keep README examples runnable after implementation. This requirements-only change does not bump package.json, install dependencies, implement commands, lock unfinished specs or publish v0.2.7.
## Assumptions / risks
No GitHub Issue sync, multiwriter coordination or CLI-generated natural-language task decomposition. Existing feature-specific human approvals and exact-artifact publication approval remain required.
Behavioral acceptance requires TEST-PLAN-FLOW-001/003 plus real installed-host controls for TEST-PLAN-FLOW-002; keyword checks alone are insufficient. Agent obedience and prose quality have limits distinct from CLI enforcement.
