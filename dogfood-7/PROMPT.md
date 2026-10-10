# Dogfood-7 agent brief (one app per agent)

You are dogfooding the `lean-sdd-tdd` skill (`/home/nahisaho/GitHub/musubix6/.github/skills/lean-sdd-tdd/`, script `scripts/sdd.mjs`, docs `SKILL.md` + `references/`). Build ONE complex application end-to-end using the skill's workflow, with the goal of **finding bugs in the skill/script itself** (musubix6).

Rules
- App dir: `/home/nahisaho/GitHub/musubix6/dogfood-7/<APP>` (create it; `git init` NOT needed). `S="node /home/nahisaho/GitHub/musubix6/.github/skills/lean-sdd-tdd/scripts/sdd.mjs"`; run with `--root <app dir>`.
- Scope: 4-6 features, ~40-80 REQs total, mostly tier T2 (state machines, concurrency/policy, public contracts) with `.sdd/plan.md`, spikes, a review file, multi-package/multi-module layout using the stack named in the assignment. Follow the full loop: spec → test with @id/@verifies → `tdd stub` where applicable → `tdd red` → implement with @implements → `tdd green` → refactor → `gate`. Include at least 2 bug-fix cycles, 1 refactor cycle, 1 cross-feature `impact` query, `gate --changed`, and one deliberately tricky case (weak Red, characterization/test-only REQ, deferred REQ, spec edit after Green, merge-ledger, monorepo `projects`) as fits the stack. Final `gate` (full) must exit 0 or be explained.
- Be complex and real: the implementation must genuinely work (no fake stubs that pass tests).
- DO NOT modify anything under `.github/` (the script is being tested; fixes are done later by the maintainer). If the script misbehaves, record it and use the documented workaround.
- Do not touch other apps' directories. Never `git commit`/push. Install nothing globally.
- Findings: write `/home/nahisaho/GitHub/musubix6/dogfood-7/findings/<APPNO>.md` (e.g. `app001.md`). Only genuine bugs/defects/doc errors/misleading messages in the skill/script/docs (not your own mistakes). For each: `## F<n>. <title>`, minimal Repro (commands; put a reproducible minimal fixture under `dogfood-7/findings/repro-<APPNO>-<x>/` if more than 3 lines), Actual, Expected, Location (sdd.mjs line/function if you can tell), Workaround, Severity (high/med/low). Start the file with one summary line: stats (features, REQs, cycles, final gate exit). If none found, say so and be sure you really exercised edge paths.
- Keep your final reply ≤8 lines: app name, REQ count, gate result, number of findings, finding titles.
