---
name: lean-agentic-coding
description: "Use for any non-trivial AI coding task to get SDD-grade rigor (approval, TDD evidence, trace, delta review) at minimal token cost via risk tiers, progressive disclosure and compact gate output. 実装・修正・レビュー時に、リスク階層で厳格さを調整しトークンを節約したい場合に使用。"
---
# Lean Agentic Coding / 省トークン高信頼開発

Follow the user's language. Detail lives in `references/`; load a file only when its step is reached.
Rule: **rigor scales with risk, context scales with the diff.**

## 0. Tier first (1 line, before reading code)
| Tier | When | Required |
| --- | --- | --- |
| T0 | typo, docs, rename, no behavior change | edit → fast check |
| T1 | behavior change / bug fix | contract line → Red → Green → gate |
| T2 | security, policy, public contract, data, state machine, concurrency | T1 + spike → human approval → parallel risk review |

Unsure → pick the higher tier. Escalate mid-task if a T2 trigger appears; never downgrade silently.

## 1. Context budget (all tiers)
- Read `AGENTS.md` (≤1 KB pointer file) and the single contract file only. Locate with grep/glob; `view` with line ranges; never read whole large files, lockfiles, coverage, `node_modules`, generated output.
- Run commands with quiet flags and `| tail`/`head`; report only failures + counts. Use `scripts/gate.sh` for compact results.
- Independent reads/searches in one parallel batch. Delegate to sub-agents only work needing separate context, and give them a bounded goal + stop condition + "return ≤200 words".
- Do not restate plans, re-read unchanged files, or paste diffs back. Cite `path:line`.
- Suggest `/new` at a task boundary when the session grows large; carry over only the handoff block (§6).

## 2. Contract = single source of truth (T1+)
Keep one file per feature (`docs/contract/<feature>.md` or the repo's existing equivalent) with: goal, `REQ-<F>-nnn` EARS lines, non-goals, verification command per REQ. No second requirements/design copy. Missing → write ≤30 lines, not a long spec. See `references/contract-template.md`.

## 3. T1 loop
1. Failing test first, named/annotated with its REQ ID (`@verifies REQ-F-001`). Run it, confirm Red for the right reason.
2. Minimal code to Green; `@implements REQ-F-001` on the code. Refactor only after Green.
3. `scripts/gate.sh` (typecheck + lint + tests). Fix, rerun; stop after 3 identical failures and report the blocker.
4. Never weaken tests, skip checks, or count skipped as passed.

## 4. T2 additions (see `references/t2-protocol.md`)
1. **Spike**: isolated scratch run of the riskiest assumption (real runtime, all command shapes) before design is final; record result in 3–5 lines.
2. **Enumerate** state machines/policy tables fully and test every row.
3. **Approval**: list exact artifact paths + hash + residual risks, then `ask_user`. Stale artifact (hash changed) → re-approve.
4. **Review**: parallel by risk axis (security / correctness / contract), each limited to the diff and the finding ledger; no whole-repo review.
5. Loosening a policy/security rule needs explicit human sign-off.

## 4b. Parallel work (T1/T2, optional)
1 session = 1 lane = 1 worktree; change only your lane's packages. Contract changes get their own PR first. 1 PR = 1 purpose; PR body lists REQ IDs.

## 5. Delta review loop
Keep a finding ledger (`references/ledger-format.md`, one line per finding: id, severity, state Open/Fixed/Rejected/Deferred). Re-review only: previous Open items + the fix diff. Stop when two consecutive passes report none. Machine checks (types, tests, gate) run before any LLM review.

## 6. Handoff block (end of task, ≤10 lines)
Tier · REQ IDs · changed paths · gate result · open findings · next step. Optionally append to `docs/devlog/` (date, goal, evidence, risk).

## Guardrails
No secrets in commits; no direct push to `main`; add the `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer to commits; do not fabricate evidence — state what was not run.
