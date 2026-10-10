---
name: sdd-spec-interview
description: "Use when the user says what they want to build (a feature, API, app, bug fix) and the requirements are not yet written: interview the user one question at a time until nothing material is missing, then write the SDD spec (.sdd/specs/<feature>.md with REQ IDs, EARS wording, TEST IDs, tier, approval) for lean-sdd-tdd. 「〜を作りたい」という依頼から、足りない要件を1問1答で確認し、要件定義書(SDD spec)を作成するときに使用。"
---
# SDD spec interview / 要件ヒアリングから spec 作成

Follow the user's language. Output of this skill = `.sdd/specs/<feature>.md` in the `lean-sdd-tdd` format (see `../lean-sdd-tdd/references/spec-template.md`). Implementation is **not** started here; hand over to `lean-sdd-tdd`.

## Rules
1. **Read first, ask later.** Before the first question, inspect the repo (stack, existing specs `.sdd/specs/`, similar code, README) and the user's prompt. Never ask what you can find out.
2. **One question at a time** via `ask_user`, one field per form. Each question gives 2–4 concrete options, a recommended default (pre-selected) and allows free text. No question lists, no questions in plain text.
3. **Ask only what changes the spec.** Skip a topic when the answer is obvious from the prompt/repo; state it as an assumption instead. Stop asking as soon as the checklist below is covered or defaulted. Typical total: 3–8 questions; hard cap 10, then proceed with defaults.
4. **Echo before writing:** after the last answer, show a ≤10-line summary (goal, scope, key behaviours, assumptions) and write the spec unless the user objects.
5. Record every default you chose in `## Assumptions / risks` with the test or spike that would retire it. The user may answer "おまかせ/default" at any time: take the recommended option.

## Checklist (ask in this order, skipping what is known)
1. **Goal & users**: one-sentence purpose; who/what calls it. Non-goals.
2. **Stack & placement**: language/framework, where the code lives (only if not detectable).
3. **Core behaviours**: the 3–7 main "When X, the system shall Y" behaviours; one row each.
4. **Inputs & validation**: types, empty/whitespace/oversized values, case handling, unknown values. Decide the failure *shape* (exception / status code / error payload).
5. **Failure & edge semantics**: unknown id (404 vs create), duplicates, partial failure, retries, idempotency, ordering/tie-breaks, rounding/units.
6. **State & concurrency** (if any state): allowed transitions, atomicity requirement or explicit `deferred`.
7. **Interfaces & contracts**: public API shape, cross-language/golden files (shared fixtures → `(test-only)` REQs), framework behaviours that must be pinned (what the framework does on invalid input, not what you assume).
8. **Security / data / irreversible actions**: auth, secrets, deletion, publishing → decides `tier: T2` and possibly `approval: human`.
9. **Non-functional** only if relevant: performance bound, compatibility.
10. **Design (T2 only, after the requirements are agreed)**, one question each: components and boundaries (what owns what); data flow / external dependencies; state machine (states, transitions, illegal ones) or policy table; key decisions with the rejected alternative; riskiest assumption (becomes a spike). Write answers into `## Design`.
11. **Large work (more than ~5 features or one spec would exceed 30 lines)**: propose a split into features and a build order with dependencies; confirm with the user; write `.sdd/plan.md`, then interview and spec each feature in that order.

## Tier and approval (decide, do not ask unless unclear)
- T1: behaviour change/bug fix. T2: security, policy, public contract, data, state machine, concurrency. Unsure → T2.
- `approval: auto` by default; `approval: human` only for loosening security/policy, destructive/irreversible operations, secrets, release/publish, or an unresolved product decision (see `lean-sdd-tdd`).

## Writing the spec
- Path `.sdd/specs/<feature>.md`; front matter `feature`, `tier`, `approval`. ≤30 lines; split features that exceed it.
- One EARS row per testable behaviour: `When <trigger>, the system shall <response>.` / `If <bad condition>, then the system shall <response>.` / `While <state>, …`. Each row is atomic, observable, has a concrete value or status code, and one or more `TEST-<F>-nnn`.
- IDs: `REQ-<F>-nnn`, `TEST-<F>-nnn`, globally unique. Unknowns that the user postponed → `(deferred)` row with `—` test. REQs verified only by golden/characterization tests → add `(test-only)` to the row.
- `## Design` (≥2 non-blank lines, ≤10) is **required for T2** (`approve record`, `guard` and `gate` reject a T2 spec without it); for T1 only when decisions are non-obvious. Add `## Assumptions / risks`.
- Large work: `.sdd/plan.md` table `| order | feature | depends | note |` (`depends` = comma-separated features or `-`); check with `node <lean-sdd-tdd>/scripts/sdd.mjs plan`.
- Do not invent requirements the user did not confirm and that are not recorded as assumptions.

## Hand-off
1. Run `node <lean-sdd-tdd>/scripts/sdd.mjs approve prepare <feature>` to confirm the spec parses (REQ list printed).
2. Tell the user, in ≤5 lines: the spec path, the REQ count, the tier/approval, the assumptions chosen.
3. Continue with `lean-sdd-tdd` (independent review → `approve record` → tests Red → code Green → `gate`) if the user asked for implementation; otherwise stop.

## Question examples
- "入力が空文字・空白のみの場合の扱いは?" → 422 を返す(推奨) / 空として受け付ける / 例外を投げる
- "存在しない ID の更新は?" → 404(推奨) / 自動作成 / 無視
- "同時更新の整合性は?" → 今回は対象外(deferred・推奨) / 原子的に保証
