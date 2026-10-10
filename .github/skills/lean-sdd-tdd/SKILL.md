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
- **T0** typo/docs/rename, no behavior change: edit → project checks. No spec, no ledger.
- **T1** behavior change / bug fix: spec (≤15 lines) → Red → Green → gate.
- **T2** security, policy, public contract, data, state machine, concurrency: T1 + spike + spec lock after AI review + parallel risk review.
Unsure → higher tier. Escalate on discovery; never downgrade silently.

## 1. Spec (one file = requirements + design + approval unit)
`.sdd/specs/<feature>.md`, template in `references/spec-template.md`. Frontmatter `feature`, `tier`, optional `approval: human`. One `REQ-<F>-nnn` line per requirement (EARS). Bug fix: one REQ describing the correct behavior. First use: `$S init`.

## 2. T1/T2 loop (each step one command)
1. Write the test with `/** @id TEST-F-001 @verifies REQ-F-001 */` above it and the test title containing `TEST-F-001`.
2. T2 only: spike risky assumptions in scratch (see `references/t2.md`), AI-review the spec, then `$S approve record <feature> --by ai:<reviewer> --review "<1 line>"`.
3. `$S tdd red TEST-F-001` → must fail by assertion. Load/compile error is rejected: add a failing stub (preferred) or `--weak`.
4. Implement minimal code with `/** @id CODE-F-001 @implements REQ-F-001 */`. Do not edit the test.
5. `$S tdd green TEST-F-001`. Test edited since Red → rejected: revert, or record a new Red.
6. Optional refactor, then `$S tdd refactor TEST-F-001`.
7. `$S gate --changed` (trace + evidence for touched REQs + project checks). Fix; stop after 3 identical failures and report.
Batch: write all tests for a feature, then red each, implement, green each, **one** gate at the end.

## 3. Rules the script enforces
Spec lock (T2) · Red before Green with identical test hash (per test: its own `@id` region + the preamble before the first `@id`, so editing one test keeps its siblings' evidence) · hash-chained `.sdd/tdd.jsonl` · every REQ has a test, every annotation resolves · skipped checks ⇒ `INCOMPLETE` (exit 2), never PASS.
Not enforced (agent discipline): test quality, mutation, security review. Do not claim them.

## 3a. Install & config
- Install per-user (`~/.copilot/skills/lean-sdd-tdd`) when the target repo asserts its skill list (e.g. a test enumerating `.github/skills`); copying into `.github/skills` can break such tests. Run `node <skill>/scripts/sdd.mjs --root <repo> ...`.
- Build the target first (`npm run build`) if its CLI tests need build artifacts, before `gate`.
- `.sdd/config.json`: `scan:{include:[],exclude:["fixtures/**"]}` (globs; only comment-leading `@id` lines count); `timeoutMs` globally or per check; check `changedCmd` with `{changedFiles}`/`{changedTests}` used by `gate --changed` (auto: `vitest related`, `jest --findRelatedTests`). `gate --changed` uses `changedTimeoutMs` (default 60s) so hub-file changes fail fast with `TIMEOUT`; narrow with `changedCmd` such as `["npx","vitest","run","{changedTests}","{changedScopes}"]` (scopes = package dirs). Always run the full `gate` (no `--changed`) before merge. Non-JS stacks get an auto `changedCmd` (no-pkg roots): Go `{changedGoPkgs}` (changed packages + reverse deps via `go list`), Rust `{changedCargoPkgs}` (`-p` changed crates + dependents via `cargo metadata`), Maven `{changedModulesCsv}`, Gradle `{changedGradleTasks}` (`:mod:cleanTest :mod:test` for changed modules plus dependents found from `project(':x')` references; not `buildDependents`, which misses later-evaluated dependents), CMake `{changedCtestRegex}` (`ctest -R` of changed test files). When a change cannot be scoped (go.mod/Cargo.*/root Gradle files, non-test C/C++ sources, CMake files, files outside any module) the full check runs and `! cmd …: cannot scope changes` is printed. Hub detection (JS/TS relative-import graph): if > `hubThreshold` (0.25) of test files depend on the change, `hubFallbackCmd` runs (`{changedTests} {directTests}`); if that exceeds `hubMaxTests` (30) the check is skipped as INCOMPLETE instead of timing out. Workspace package names and tsconfig `paths` are followed. For hub changes the uncommitted diff is mapped to exported symbols (comment/whitespace-only ⇒ skipped; declarations mentioning the symbol are tainted transitively) so only tests that can reach them run; unknown diffs (non-exported/top-level code, `export *`) keep the whole hub set; an empty selection is INCOMPLETE, never an unscoped full run. Timeouts report `TIMEOUT`, not FAIL.
- Legacy repos: `trace --baseline` snapshots errors to `.sdd/trace-baseline.json`; later trace/gate report only new errors (counted per message, so an added same-kind error is new) (`--changed` also limits to changed files).
- New module tests: `tdd red <ID> --missing-module` accepts a Red caused by the test's own not-yet-created import (not weak).
- Stub Red: if the throwing stub is hit by a setup call rather than an assertion, Red is recorded weak with a warning. `tdd red <ID> --expect <text>` requires the failure output to contain the text (wrong-reason Red is rejected); `--allow-setup-red` accepts it as-is.
- Go/Rust: default `testCmd` is `go test ./... -run {IDU}` (e.g. `TEST_CALC_001`, name test funcs `TestTEST_CALC_001_…`) / `cargo test {idu}` (`test_calc_001_…`). Placeholders: `{id}`, `{idu}` (lower_snake), `{IDU}` (UPPER_SNAKE). `tdd stub` supports ts/js/py only; Go and Rust were verified end-to-end (Red/Green/gate). Rust inline `#[cfg(test)]` tests work: when a file also holds `@implements` code, only the test's own `@id` region is hashed. Go `[build failed]` is a load error, not a Red.
- Maven / Gradle (`./gradlew` if present) / CMake+CTest are auto-detected (verified: Maven 3.9 + JUnit5, Gradle 8.14 + JUnit5, CMake/ctest). Name the test method / ctest test so it contains the lowercase ID (`test_calc_001_add` for `TEST-CALC-001`); `{idu}` is substituted into `-Dtest=*#*{idu}*`, `--tests *{idu}*` and `ctest -R`. Gradle runs through a temporary init script (`failOnNoMatchingTests=false` + a `Tests run: N` total per task), so multi-project builds work from the root and a subproject without a match does not fail the build; multi-module Maven works from the root too (zero-test modules are ignored when another module ran tests). Maven `gate --changed` runs `-pl <changed modules> -amd` (dependents included; falls back to the full check when changes are outside any module); Gradle `--changed` runs the full check. POM/Gradle build-script errors are load errors, not Red. Gradle 8 needs JDK ≤ 24 (set `JAVA_HOME`). CMake builds into `build/` (git-ignore it); it configures once, builds incrementally with the log shown only on failure, and `--changed` runs the full (incremental) check.
- Makefile (`make test TEST={idu}` — your `test` target must pass `$(TEST)` to the runner to filter; verified with a C runner) and .NET (`*.csproj`/`*.sln` → `dotnet test --filter FullyQualifiedName~{idu}`; **not verified**, dotnet unavailable) are auto-detected after the language-specific stacks.
- Test-name fallback: if the test file does not contain the lowercase ID, `{idu}` becomes the name of the test declared right below `@id` (skipping annotations/comments), so camelCase JUnit methods (`void addsNumbers()`) work without renaming. Keep the `@id` comment directly above the test.
- PHP (`composer.json`/`phpunit.xml` → `phpunit --do-not-cache-result --filter {idu} {file}`, `vendor/bin/phpunit` if present), Julia (`Project.toml` → `julia --project=. {file}`, whole file per run) and R (`DESCRIPTION` → `testthat::test_file`, whole file per run; verified with testthat 3; set `R_LIBS_USER` if testthat is in a user library) are auto-detected. `tdd stub` writes the file the test loads (`require_once`/`include`/`source`) with throwing functions (`LogicException` / `error()` / `stop()`) for the unknown calls. Name PHP test methods so they contain the lowercase ID.
- `tdd stub` also covers Go (`go test` finds `undefined: X`), Rust (`tests/*.rs` → `src/lib.rs`), Java (`Cls.method(` → `src/Cls.java` / `src/main/java`) and C/C++ (missing `#include "x.h"` → header-only stub; names from compiler diagnostics). Arity comes from the call site and the return type from the compared literal (`== 3`, `, "s")`, `.is_err()`), falling back to `int`/`i64`/`any`; if the stub does not compile, write it by hand. Stubs only fill in missing files/functions; C/C++ stubs are header-only, so drop the missing `.c`/`.cpp` from your build command.
- Polyglot monorepo: when the repo root has no manifest, `init` finds nested manifests (go.mod, pyproject.toml, Cargo.toml, pom.xml, …) and writes `projects: [{root, testCmd, checks}]`. `tdd` runs a test with its project's `testCmd` in that directory (`{file}` is relative to it); `gate` runs every project's checks as `<root>:<name>` in its cwd; `gate --changed` skips projects with no changed files.
- Mixed monorepo: if the root has a manifest (e.g. package.json), nested projects of a *different* stack (services/go) are still added to `projects`; nested projects of the same stack (npm workspaces) stay with the root. `projects[].dependsOn: ["libs/shared"]` (manual) makes `gate --changed` run the project when a dependency root changes; the path may be any shared directory (e.g. `contract/` shared by a TS API and a Python worker), and `gate --changed` hints when root-owned files changed that no project depends on. Root checks (no `cwd`) are skipped when every changed file is inside a nested project. A project check with `changedCmd`/`hubFallbackCmd` gets `{changedFiles}`/`{changedTests}`/`{changedScopes}` relative to the project root; a dependency-only change runs the full project check.
- Other stacks (C/C++/Java/…, verified with plain `sh run_tests.sh <name-filter>` runners): `init` warns that testCmd is a Node fallback; set `testCmd` yourself to a runner that takes the test-name filter, e.g. `["sh","run_tests.sh","{idu}"]` (the runner must exit non-zero when no test matches), and a `checks` entry for the full suite. Annotate with `//` or `/* */` comments; `.c .h .cc .cpp .cxx .hpp .hh .java` are scanned.
- `prepare: {cmd, outputs?, inputs?, timeoutMs?}` in config (auto-set from the `build` script by `init`): `gate` runs it first and caches by input hash (`.sdd/prepare-cache.json`); skipped when inputs and `outputs` are unchanged.
- `tdd stub <TEST-ID>` writes throwing stubs for the test's missing relative imports (ts/js/py), so `tdd red` is a real, non-weak Red.
- If `--review` is a file (e.g. `.sdd/review.md`) it must follow the schema from `$S review template <feature>`: header lines `spec: sha256:<hash>` (first 12 hex chars required), `verdict: pass` (the template starts as `pending` and is rejected until edited), `open: <n>`; findings carry an explicit status (table cell, `- [ ]`, `state: open`, `**Open**`). `open:` must equal the Open lines found and be 0. Validate with `$S review check <file> --feature <f>`.
- Data-only / characterization tests (e.g. a contract lock check) pass without any implementation, so `tdd red` rejects them; record them explicitly with `tdd red <ID> --characterization "<why>"` (stored as a weak Red and counted separately in the gate).
- `approve record --by ai:<reviewer>` requires `--review <path|summary>`; `ai:self` is refused; gate shows lock kind and review evidence.

## 4. Review without humans
T2 only: parallel sub-agents by risk axis (security · correctness/state · contract · test adequacy), each diff-only, ≤200-word replies, findings to `.sdd/review.md` (one line each: id|sev|path:line|state). Re-review Open items + fix diff only; stop after two clean rounds, then lock/merge.

## 5. Token rules
Read the spec and the specific files only; `view` ranges; quiet commands; one parallel batch for independent reads; no plan recaps; cite `path:line`. Suggest `/new` at boundaries. End with ≤8 lines: tier · REQs · gate verdict · open findings · next.

## Guardrails
No secrets; no push to `main` without request; commit trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`; state what was not run.
