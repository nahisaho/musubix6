---
feature: r36i-c-compiler
tier: T2
approval: auto
---
# Issue #373: truthful C/C++ native compilation verification
Goal: fail closed on the invoked compiler's unsuccessful outcome without losing supported stub generation.
Non-goals: change shared string-probe semantics, Rust's approved success predicate, other languages, compiler selection/options, support catalogue, existing tests, runner budgets or release qualification.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-R36I-001 | When C/C++ stub verification invokes the required compiler, the CLI shall verify compilation only if its actual outcome has status zero and no startup/process error or termination signal; otherwise it shall exit nonzero with an explicit failure reason ordered as underlying error CODE, signal X, exit status N or status unavailable, with parsed compiler text supplementary and never replacing the outcome, even when output is empty, terminal-only or unparseable and whether stubs were generated or nothing needed generating. | TEST-R36I-EXIT-001, TEST-R36I-INVALID-001, TEST-R36I-BOUNDARY-001, TEST-R36I-REASON-001 |
| REQ-R36I-002 | When C/C++ compiler output contains SGR decorations, the CLI shall normalize them once at its language boundary before both diagnostic-driven stub-name parsing and verification, and shall reject any remaining compiler error diagnostic even on exit zero while preserving valid colored native stub generation. | TEST-R36I-DIAGNOSTIC-001, TEST-R36I-PARSE-COLOR-001 |
| REQ-R36I-003 (test-only) | When real C/C++ native compilation succeeds without compiler errors, the CLI shall retain successful no-op verification and supported throwing function-stub generation; when native compilation reports errors, the CLI shall retain failed-compilation diagnostics. | TEST-R36I-NATIVE-001, TEST-R36I-PARSE-001 |

## PASS conditions and counterexamples
| REQ | Observable PASS condition | Counterexample (input + expected result) | TEST/command | Evidence |
| --- | --- | --- | --- | --- |
| `REQ-R36I-001` | Status zero AND no signal/error are necessary for either verified output branch; every adverse outcome exits 1 with an explicit reason. | Native-valid source plus silent compiler exit101, exact `#error r36g_native_invalid` plus exit101, ANSI-only101, opaque101, SIGTERM, ENOENT, ENOBUFS must never print verified compilation. | TEST-R36I-EXIT-001, TEST-R36I-INVALID-001, TEST-R36I-BOUNDARY-001 | Independent pre-fix spike passed on Node20.20.2/22.23.3/24.21.0; all three regression IDs fail by `AssertionError` on each runtime, CLI wrongly exit0. Logs `r36i-red-v*.log`. |
| `REQ-R36I-002` | Plain and internally SGR-split `error:` both retain rejection despite compiler exit0. | Compiler exit0 with `er<SGR>ror<reset>:` must fail, not become compile-checked. | TEST-R36I-DIAGNOSTIC-001 | Actual assertion Red on all three runtimes; independent spike preserves plain error rejection and demonstrates split-SGR false verification. |
| `REQ-R36I-003` | Actual cc/c++ valid no-op sources and generated `answer(2)` stubs syntax-check with native exit0; native `#error` remains rejected. | Rejecting an actual valid native compiler or losing function-name parsing must fail positive controls. | TEST-R36I-NATIVE-001, TEST-R36I-PARSE-001 | Both EOF characterization controls PASS on all three runtimes; eight existing targeted C/C++ controls + both new controls PASS (10/10, Node24), `r36i-controls-v24.21.0.log`. |
Oracle: `/usr/bin/cc` and `/usr/bin/c++` (Ubuntu 15.2.0) invoked independently before CLI; expected status and diagnostic content derive from actual native compile of intentionally valid/invalid source, not CLI output. Controlled compiler outcomes independently prove process-status transport, not compiler authenticity.
Risk stages: contract/verdict are CLI exit and verified wording; inputs are exact C fixture plus equivalent C++ and valid controls; execution tests process outcomes and existing 120000ms probe budget; history/ledger remains unchanged and evidence is not approval; integration preserves CMake/compile_commands context and shared string-probe consumers. Packaging/release/publishing are out of scope.

## Design
- Existing `stubC` compiler selection, arguments, cwd and include/stub generation remain unchanged (`sdd.mjs:3019-3134`); shared textual `probe` retains byte-identical raw text semantics.
- Coordinator authorizes integration of approved Rust commit `246520f3` after committing Red/spec work, preserving complete original, G and I EOF tails.
- Extract dependency-free raw `probeOutcome(cmd,args,cwd)` next to `probe`: exactly existing spawnSync options (cwd, UTF-8, 120000ms, environment spread + LC_ALL C), returning raw `{text,status,signal,error}`. Legacy `probe` returns `.text` without normalization.
- Rust's `cargoTest` uses shared raw outcome then strips SGR once exactly as approved; its success predicate and all other Rust behavior remain unchanged. C's syntax helper similarly normalizes once before every consumer; no normalization option/config or duplicated process wrapper.
- Generation consumes `outcome.text` for its existing name-diagnostic parser; final verification consumes the final required compiler outcome, not absence of matched text and not a stale initial compilation.
- Ordered decision table: spawn error → failed with `error CODE`; signal → failed with `signal X`; nonzero → failed with `exit status N`; null → failed with `status unavailable`; normalized error diagnostic → failed with diagnostic; only exit0/no-error/no-signal/no-error-diagnostic → verified.
- Preserve `made.verified='fail'` and the existing C/C++ exit1/output dispatch (`:4864-4875`); no silent downgrade to informational exit0. Parsed diagnostic may augment but never replace process failure evidence.
- Parsed text supplements process reasons, never replaces them; reason-order control combines actual nonzero/signal/ENOBUFS with parsed errors. Colored-parser control runs actual native cc/c++ behind a text-coloring wrapper and independently syntax-checks generated stubs.

## Assumptions / spike / risk retirement
- Exact supplied `r36g-other-c-finding/tests/t.c` and generated header are byte-copied for independent native compile before CLI: native exit1 from deliberate `#error`, fake actual compiler exit101/no output, current CLI exit0/verified; equivalent C++ agrees.
- Independent native valid controls compile with exit0 and current CLI accepts them on Node20/22/24. Evidence: session `files/r36i-spike.mjs`, `r36i-spike-v20.20.2.log`, `r36i-spike-v22.23.3.log`, `r36i-spike-v24.21.0.log`, retained `r36i-spike-fixtures/`.
- Real controlled outcomes on every runtime and both languages: exit101/ANSI-only, exit101/opaque, status-null/SIGTERM, status-null/ENOENT, status-null/SIGTERM/ENOBUFS, and exit0/split-SGR error all falsely produce verified compilation before fix; plain error exit0 correctly rejects.
- Actual pre-lock Red command: `node --test --test-name-pattern='TEST-R36I-' .github/skills/lean-sdd-tdd/scripts/sdd.test.mjs`, selected runtime bin prefixed to PATH. Each runtime: four assertion failures, two native positive controls PASS. No ledger Red claimed until independent spec review/lock.
- Production remains byte-identical to base (SHA256 `5a26ef1eb9daae8ad71310ae35fdeef6c91cb88a792c70126742b9c4b65867a7`); scoped trace of the exact appended test/spec snapshot reports 3 requirements, 6 annotated tests, zero errors and two expected missing-production warnings (`r36i-scoped-trace.log`). Root default trace does not scan hidden `.github` and fails for existing and new requirements (`r36i-trace.log`); no gate/full-suite/lock claim is made.
- No timeout reduction, extra dependencies or unrelated language changes; SIGTERM/ENOENT/ENOBUFS exercise real bounded process boundaries without spending 120 seconds. Actual timeout mutation coverage remains unrun, not claimed.
- Planned isolated mutations: bypass process-success predicate; skip C SGR normalization (verification + native parser); put parsed error before process failure; normalize legacy probe output. Restore exact bytes and rerun native positives after each. Green/mutations currently unrun.
- Independent Sonnet conditional T2 approval supplied by coordinator (2026-10-14 15:58 JST): preserve raw legacy probe and Rust predicate, outcome-first reason order, independently tested colored C parser. Amendments above and coordinator shared-raw-helper decision are the approval basis; no self-review claimed.
