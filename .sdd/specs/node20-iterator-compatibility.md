---
feature: node20-iterator-compatibility
tier: T1
---
## Requirements
| REQ-NODE20-001 | When a supported Node runtime lacks iterator helpers, Red classification shall preserve setup-call weakness and asserted-subject strength without crashing. | TEST-NODE20-001, TEST-NODE20-002 |
## Observable conditions
| REQ | PASS condition | Counterexample | TEST/command | Evidence |
| `REQ-NODE20-001` | A real named stub in setup records Red with `[weak]` and `setup call "add"`; the same stub inside a validation assertion records non-weak Red. Ledger contains exactly one matching Red and the expected weakness. | Iterator `.map` crashes; setup becomes strong; asserted subject becomes weak; Red is not persisted. | Appended `TEST-NODE20-001/002`, native and child-local helper-disabled controls on Node 20/22/24. | Retain r36a Red/Green/mutation/restored raw logs in coordinator session files. |
## Scope
Fix the two direct `matchAll(...).map` calls in `setupOrigin` with existing array-spread patterns; retain Node >=20, one zero-runtime-dependency script, and existing admission/parser behavior.
Audit all iterator-producing call sites, including stack-location extraction. No new verdict defaults or catches. Package installation and full-suite/release qualification are coordinator responsibilities.
## Validation
Before implementation, both appended tests must fail by an outer assertion on observed CLI status/output, not a test import/compile failure. Reintroduce each helper call separately, require assertion failure, restore the exact source bytes, and rerun selected controls. Input/execution/verdict/persisted history are exercised; unrelated runner admission and integration qualification are out of scope.
## Executed evidence (2026-10-14, Issue #365)
Working directory: `musubix-fix-r36a`, base `1ee528a`. Raw logs live in `/home/nahisaho/.copilot/session-state/ba9f04e0-ab0d-4d64-ac09-eec2b5ef0ba5/files/`.
Let `T=.github/skills/lean-sdd-tdd/scripts/sdd.test.mjs`; every `node` invocation below used the indicated runtime bin prepended to `PATH`, including spawned runner processes.
Node 20: `runtime20/node-v20.20.2-linux-x64/bin`; Node 22: `runtime22/node-v22.23.3-linux-x64/bin`; host Node 24.21.0.

| Actual command | Runtime / state | Exit / observable result | Raw log |
| --- | --- | --- | --- |
| `node --test --test-name-pattern='#365' "$T"` | Node 20 and 24, before production edits | 1; both tests assert-fail on CLI exit 1, with `setupOrigin:4116` unsupported iterator `.map`. | `r36a-red-node20.log`, `r36a-red-node24.log` |
| Same command | Node 20, 22 and 24, fixed | 0; two selected tests pass, each exercising native and helper-disabled children and persisted Red classification. | `r36a-green-node20.log`, `r36a-green-node22.log`, `r36a-green-node24.log` |
| Same command | Node 24, only helper-name `.map` reintroduced | 1; two assertion failures on `setupOrigin:4116`. | `r36a-mutation-helpernames-node24.log` |
| `sha256sum -c …/r36a-source-sha256.log &&` same command | Node 24, first mutation restored | 0; source byte-identical, two pass. | `r36a-restored-helpernames-node24.log` |
| Same test command | Node 24, only stack-location `.map` reintroduced | 1; two assertion failures on `setupOrigin:4204`. | `r36a-mutation-stacksites-node24.log` |
| `sha256sum -c …/r36a-source-sha256.log && node --test --test-name-pattern='#365\|^#14 stub Red\|^#35 weak-Red\|^#106 weak Red\|^#124 .NET NotImplementedException\|^#263 Rust import alias' "$T"` | Node 20, 22 and 24, final restored source | 0; source byte-identical, seven selected tests pass on each runtime. | `r36a-restored-node20.log`, `r36a-restored-node22.log`, `r36a-restored-node24.log` |

Node 20 reports 1,070 name-filtered skips in the seven-test selection; no selected test skips. This was not a full-suite run. The initial fixture approval preflight failure is retained separately as `r36a-fixture-preflight-node24.log`, not counted as Red evidence.
TypeScript 5.9.3 AST audit covered 462 `matchAll`/`values`/`keys`/`entries` calls: only the two fixed direct iterator-helper chains were unsafe. After repair, 411 non-Object iterator producers are consumed by spread (228), `for…of` (181), Set construction (one), or nullish fallback inside spread (one); no iterator aliases or unsafe direct helpers remain (`r36a-iterator-audit.log`, exit 0).
`node --check` on source/tests and `git diff --check` pass. `npm ci --ignore-scripts --no-audit --no-fund --quiet` restored the existing dev-only parser after `require("typescript")` failed; manifests and lockfile are unchanged.
Readonly baseline `r35-node20-full.log` still records 1,072 tests / 1,019 pass / 49 fail / four TODOs; this targeted fix does not attribute every baseline failure to iterator helpers or claim release qualification. Full suite and integration with #366 remain coordinator-owned.
