---
name: sdd-reverse-spec
description: "Use when code already exists and requirements are missing or outdated, before changing it: read the existing code and tests, reconstruct the current behaviour as EARS requirements (.sdd/specs/<feature>.md with REQ IDs, evidence path:line, confidence, TEST IDs), pin it with characterization tests, and ask the user one question at a time about unclear intent. 既存コードを読み、現状の挙動を EARS 書式の要件定義書(SDD spec)として再定義し、特性化テストで固定してから改修に入るときに使用。"
---
# SDD reverse spec / 既存コードから要件を再定義

Follow the user's language. Output = `.sdd/specs/<feature>.md` in the `lean-sdd-tdd` format (`../lean-sdd-tdd/references/spec-template.md`) plus characterization tests. **The code is not changed here.** After approval, hand over to `lean-sdd-tdd` for the actual change.

A reverse spec records **current behaviour**, not intent. Every row is labelled so a reader never mistakes "what the code does" for "what it should do".

## Rules
1. **Read first, ask later.** Inspect the target (entry points, public API, tests, README, git log, existing `.sdd/specs/`) before any question. Never ask what the code answers.
2. **Scope it.** One feature = one cohesive module or entry point. More than ~30 spec lines, or several modules → propose a split and a `.sdd/plan.md` (see `sdd-spec-interview` rule 11); do one feature at a time.
3. **Evidence per row.** Each REQ cites `path:line` and a confidence: `high` (covered by tests or unambiguous code), `medium` (code only, no test), `low` (inferred, dead or odd code). Put them in a trailing `[src: path:line, conf: medium]`.
4. **Observe, don't assume.** Run the code/tests to confirm a behaviour. A row whose behaviour was not observed is `low`.
5. **Ask only about intent**, one question at a time via `ask_user` (2–4 options, recommended default, free text allowed). Triggers: behaviour looks like a bug; two code paths disagree; dead branch; undocumented magic value. Options: keep as is (spec it) / treat as bug (`(deferred)` row + assumption entry) / remove. Hard cap 10 questions, then take "keep as is" and log an assumption.
6. **Never silently fix.** A suspected bug becomes a row describing the current behaviour plus a `## Assumptions / risks` entry; the fix is a later `lean-sdd-tdd` cycle.

## Procedure
1. **Map**: public entry points, inputs/outputs, state, side effects, external calls, error paths, config; language and test runner.
2. **Extract** behaviours into EARS rows (`When … the system shall …` / `If …, then …` / `While …`). Atomic, observable, concrete values/status codes. Include the error and edge behaviours the code really has.
3. **Pin** each row with a test `TEST-<F>-nnn` (`@id`) asserting the *current* result. Reuse existing tests by ID instead of duplicating. Tests pass on the unmodified code, so `tdd red` rejects them: record with `sdd.mjs tdd red <ID> --characterization "<why>"` (stored as weak Red, counted separately in the gate; see `../lean-sdd-tdd/references/enforced-rules.md`). Mark rows verified only this way `(test-only)`. A characterization test that fails on current code means the row is wrong: fix the row, never the code.
4. **Tier/approval**: security, policy, public contract, data, state, concurrency → `T2` (needs `## Design`: components, data flow, state machine, key decisions, riskiest assumption); otherwise `T1`. `approval: human` for destructive operations or unresolved product decisions.
5. **Close the gaps**: list `low`/untested rows, unreachable code, README-vs-code differences; ask the user (rule 5) only about those.
6. **Echo** a ≤10-line summary: scope, REQ count, confidence split, suspected bugs, assumptions.

## Writing the spec
- Path `.sdd/specs/<feature>.md`; front matter `feature`, `tier`, `approval`; first body line states `Reverse spec: rows describe current behaviour`.
- IDs `REQ-<F>-nnn`, `TEST-<F>-nnn`, globally unique. Postponed/unknown → `(deferred)` row with `—` test.
- `## Assumptions / risks`: every default taken, every suspected bug (with its evidence line), every `low` row, each with the test or question that would retire it.

## Hand-off
1. `node <lean-sdd-tdd>/scripts/sdd.mjs approve prepare <feature>` to confirm the spec parses.
2. Tell the user in ≤5 lines: spec path, REQ count, confidence split, suspected bugs, assumptions. Request approval listing the exact file paths from the manifest.
3. After approval, behaviour changes go through `lean-sdd-tdd` as new REQs (Red → Green → gate); `gate --changed --baseline <ref>` guards the rest.
