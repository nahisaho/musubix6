---
name: lean-sdd-tdd
description: "Use when an AI agent must implement features or fix bugs autonomously with spec-driven development (SDD) and test-driven development (TDD) evidence, minimal human approval and minimal tokens: REQ/TEST IDs, Red→Green proof, hash-locked specs, trace check, compact gate. 仕様駆動(SDD)・テスト駆動(TDD)で、人間承認を最小化し自走で実装・バグ修正するときに使用。"
---
# Lean SDD/TDD / 自走型 仕様・テスト駆動

Follow the user's language. One zero-dependency script enforces the rules; the agent does the thinking.
`S="node <skill-dir>/scripts/sdd.mjs"` (Node ≥ 20, no install). Output is ≤15 lines: never paste it back.

## Autonomy model (human approval is the exception)
- **Default = auto**: the agent writes the spec, gets an *independent AI review* (rubber-duck / code-review sub-agent, diff-only), fixes findings, then **locks** the spec hash itself. No human prompt.
- **Human only when the spec says `approval: human`**, which you must set for: loosening a security/policy rule, destructive or irreversible operations (data deletion, force push, release/publish), secrets/credentials handling, or an unresolvable product decision. Then `approve prepare` → show exact paths + hash + residual risks → `ask_user` → `approve record --by <human>`.
- The script refuses `ai:` approvers on `approval: human` specs. Never forge a human name.
- Blocked or ambiguous → pick the safest reasonable default, record it in the spec "Assumptions", continue. Ask only if the default is irreversible.

## 0. Tier (1 line, before reading code)
- No spec yet and the request is vague ("〜を作りたい")? Use the `sdd-spec-interview` skill first: it asks the user one question at a time and writes the spec.
- **T0** typo/docs/rename, no behavior change: edit → project checks. No spec, no ledger.
- **T1** behavior change / bug fix: spec (≤15 lines) → Red → Green → gate.
- **T2** security, policy, public contract, data, state machine, concurrency: T1 + required `## Design` section + spike + spec lock after AI review + parallel risk review.
- **Large work** (several features): split into features, write `.sdd/plan.md` (`| order | feature | depends | note |`), run `$S plan` (shows done/lock state, flags unknown/misordered dependencies, prints `next:`), then do each feature as T1/T2. The Red-test order inside a feature is its implementation plan; no separate plan document.
Unsure → higher tier. Escalate on discovery; never downgrade silently.

## 1. Spec (one file = requirements + design + approval unit)
`.sdd/specs/<feature>.md`, template in `references/spec-template.md`. Frontmatter `feature`, `tier`, optional `approval: human`. One `REQ-<F>-nnn` line per requirement (EARS). Bug fix: one REQ describing the correct behavior. First use: `$S init`.

## 2. T1/T2 loop (each step one command)
1. Write the test with `/** @id TEST-F-001 @verifies REQ-F-001 */` above it and the test title containing `TEST-F-001`.
2. T2 only: spike risky assumptions in scratch (see `references/t2.md`), AI-review the spec, then `$S approve record <feature> --by ai:<reviewer> --review "<1 line>"`. `approval: human` specs: `$S approve prepare <feature>` → show the human the exact paths/hashes → `approve record <feature> --by <name>` (refused without a matching prepare; prepare again after any spec edit).
3. `$S tdd red TEST-F-001` → must fail by assertion. Load/compile error is rejected: add a failing stub (preferred) or `--weak`.
4. Implement minimal code with `/** @id CODE-F-001 @implements REQ-F-001 */`. Do not edit the test. A REQ verified only by golden/characterization tests (no implementing code): write `test-only` on its REQ line in the spec to silence the `no @implements code` warning (like `deferred`; the spec is hash-locked, so reviewers see it). `deferred`/`test-only` count only as a delimited marker (`REQ-X-1 (deferred)`, `[test-only]`, own table cell), never as a word in the prose.
5. `$S tdd green TEST-F-001`. Test edited since Red → rejected: revert, or record a new Red.
6. Optional refactor, then `$S tdd refactor TEST-F-001`.
7. `$S gate --changed` (trace + evidence for touched REQs + project checks). Fix; stop after 3 identical failures and report.
Impact: `$S impact <REQ|TEST|CODE|file> [--json]` lists implementing files, verifying tests, and other features' REQs/tests reached through imports (JS/TS precise; Py/Go/Rust/Java/C/PHP/C#/Julia best-effort, name-based — see references/enforced-rules.md). C# follows `ProjectReference` (csproj/`Directory.Build.props`/`.sln`/`.slnx` are graph nodes). Run before changing a shared REQ.
Batch: write all tests for a feature, then red each, implement, green each, **one** gate at the end.

## 3. Rules the script enforces (details: `references/enforced-rules.md`)
- Spec lock (T2, `approval: human`); REQ line changed after its test's Green ⇒ evidence stale (`tdd refactor` for wording-only, `tdd red`/`green` for behaviour; new requirement = edit spec first, then test).
- Red before Green with identical test hash; hash-chained `.sdd/tdd.jsonl` (conflict ⇒ `tdd merge-ledger`).
- Every REQ has a test, every annotation resolves (orphan/unknown REQ = error); skipped checks ⇒ `INCOMPLETE` (exit 2), never PASS.
- Human approvals: `--by` must be a real name (generic/`ai` names refused); `approve prepare` first; later `@implements` code change ⇒ gate warning.
- Not enforced (agent discipline): test quality, mutation, security review. Do not claim them.

## 3a. Config, runners, stubs (read only when needed)
- `references/config.md`: install, `.sdd/config.json` (`scan`, `timeoutMs`, `prepare`, `changedCmd`/hub scoping), per-stack `testCmd` (Go, Rust, Maven, Gradle, CMake, Make, .NET, PHP, Julia, R, other), monorepo `projects`.
- `references/stubs.md`: `tdd stub <TEST-ID>` per-language capabilities and limits.
- Red variants (`--weak`, `--expect`, `--allow-setup-red`, `--missing-module`, `--characterization`), `trace --baseline`, review-file schema (`$S review template|check`): see `references/enforced-rules.md`.
- Always run the full `gate` (no `--changed`) before merge.

## 4. Review without humans
T2 only: parallel sub-agents by risk axis (security · correctness/state · contract · test adequacy), each diff-only, ≤200-word replies, findings to `.sdd/review.md` (one line each: id|sev|path:line|state). Re-review Open items + fix diff only; stop after two clean rounds, then lock/merge.

## 5. Token rules
Read the spec and the specific files only; `view` ranges; quiet commands; one parallel batch for independent reads; no plan recaps; cite `path:line`. Suggest `/new` at boundaries. End with ≤8 lines: tier · REQs · gate verdict · open findings · next.

## Guardrails
No secrets; no push to `main` without request; commit trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`; state what was not run.
