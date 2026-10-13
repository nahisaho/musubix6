# Design: lean-sdd-tdd hardening (fail-closed, shrink heuristics, self-verification)

Status: draft (2026-10-13) / Owner: @nahisaho / Scope: `.github/skills/lean-sdd-tdd/scripts/sdd.mjs`

## 1. Background

Waves 7–15 (≈60 dogfood apps) show the finding profile shifting. Early waves found crashes, gate bypasses and wrong Red/Green verdicts. Wave 15 (5 apps, 42 findings) is mostly Low/Medium: Rust stub typing, weak-Red false positives, staleness granularity, messages. One finding stays serious: a Cargo workspace root change skips every crate check and `gate` passes (app162 F8, #312).

Fixing each finding as it appears does not converge: stub generation (regex-based, 6 languages) and weak-Red classification are long-tail heuristics. Counts stay at 5–14 per app. The tool needs structural changes, not more patches.

## 2. Goals / non-goals

Goals
- G1 No silent pass: when the tool cannot be sure, `gate` must not report green without saying why.
- G2 A wrong stub or a wrong weak-Red verdict must never block work with no way out, and never pass bad evidence.
- G3 The tool's own correctness is checked mechanically across TS/Python/Rust, not only by example tests.
- G4 A stop criterion that ends the dogfood loop.

Non-goals: new languages, splitting `sdd.mjs`, changing default behaviour of existing ledgers (all new behaviour is additive or opt-in with a documented default flip plan).

## 3. Design

### 3.1 Fail-closed gate (G1)

Introduce a single notion of **scope confidence** for `gate --changed`.

- Every check records `scope: exact | widened | unknown`.
  - `exact`: the changed file maps to a project/package via a proven rule.
  - `widened`: the tool could not map precisely and ran the broader check (e.g. all workspace members).
  - `unknown`: nothing could be run for a changed file.
- Rules:
  1. A changed file that no rule claims, or whose rule reports `unknown`, makes `gate --changed` **fail** with the file list (today: `!` warning + pass). Escape hatch: `--allow-unscoped <glob>` or `unscoped: ["docs/**"]` in config, recorded in the ledger.
  2. Cargo `Cargo.toml`/`Cargo.lock` at a workspace root, `rust-toolchain*`, `.cargo/config*`: widen to **all members** (implements #312 F8). Same for `package.json`/lockfiles at a JS workspace root and `pyproject.toml`/`requirements*.txt` for Python.
  3. `skipped: no changed files` is only valid when the check's input closure (sources + `dependsOn` + implicit roots) was computed and is disjoint from the change set. The skip reason prints the closure size.
- Output: one summary line `scope: exact=N widened=N unknown=N` so reviewers see confidence at a glance; `--json` exposes it.

Acceptance: a repro with only a workspace-root profile change must run all members (or fail); a changed file under an unmapped dir must fail unless allow-listed.

### 3.2 Safe stub generation (G2)

Stubs exist only to get a behavioural Red instead of a compile error. Wrong stubs (e.g. `EPSILON: i64`) create misleading Reds or extra compile passes.

- Each inferred element carries a **confidence**: `shown` (type literally visible in the test or an existing source), `inferred` (from a call shape), `guessed` (no evidence).
- `guessed` elements are not emitted as typed code. They are emitted as a minimal typed placeholder with a `// SDD-TODO(stub): type unknown` marker for the three languages and `todo!()`/`NotImplementedError`/`throw` bodies, so the Red is a "not implemented" failure, which is a legitimate Red.
- `tdd stub --report` prints the table (element, confidence, evidence line). `tdd red` refuses a stub containing `SDD-TODO(stub)` markers **only** when the failure is a compile error in a marked element (message names the element and says to fill the type by hand). This replaces the endless "one more shape" patches for Rust: unsupported shapes degrade to a manual-fix instruction instead of a wrong stub.
- Compile-error Reds are classified (`compile` vs `behaviour`); a compile-class Red is never accepted as evidence (already partly true; made explicit and uniform).

Acceptance: for the wave 15 stub captures in `dogfood-15/findings/*.rs.txt`, no `guessed` element is emitted as a concrete wrong type.

### 3.3 Weak-Red as advisory with explicit waiver (G2)

Weak-Red detection (is the Red caused by the behaviour or by setup?) is heuristic and has produced false positives for every pattern tried (helper naming, SUT-as-setup, destructured results).

- Split verdict into `weak` (high confidence: no assertion reached, stub throws before any assertion) and `suspect` (heuristic only).
- `weak` keeps blocking (as today). `suspect` becomes a **warning that is recorded in the ledger**, never a block, plus a one-line `--expect <text>` hint that is guaranteed to be accepted (reuses the r22a "only accepted commands" invariant).
- Review summary lists all `suspect` Reds so a human/agent reviewer audits them in one place.

Acceptance: the false-positive repros in #311 pass `tdd red` without flags and appear as `suspect` in the summary.

### 3.4 Self-verification of the tool (G3)

Example tests (≈665) pin known behaviour. They do not find new classes of error.

- **Differential check of the project mapper**: for generated workspaces (Cargo workspace with N crates, JS workspace, Python multi-project), compare `gate --changed` scope against a brute-force oracle (run all checks; a change is "relevant" if any check result differs when the file is reverted). Property: `scope ⊇ relevant`. Run on random single-file mutations (touch/edit) in CI-sized fixtures (≤30 s).
- **Stub round-trip**: take real tests from `dogfood-*` apps (kept as fixtures, MIT-safe snippets only), generate stubs, and assert: (a) the stub compiles in 3 languages or carries a `SDD-TODO(stub)` marker for each uncompilable element; (b) no element has `guessed` confidence without a marker.
- **Ledger invariants**: replay `tdd.jsonl` fixtures and assert state-machine invariants (Red before Green, no Green for stale evidence, merge-ledger idempotence). Part of the existing suite, but generated rather than hand-written.
- Toolchain availability: tests that need cargo/pytest/node skip with an explicit `SKIP: toolchain missing` that is counted (the suite must not silently drop to 0 ran).

### 3.5 Stop criterion for dogfooding (G4)

Replace "0 findings in a wave" with severity classes:

| Class | Examples | Wave must have |
|---|---|---|
| S1 | crash, gate false-pass, wrong Green accepted, data loss | 0 |
| S2 | wrong Red/stub that blocks and has no workaround | 0 |
| S3 | heuristic miss with a documented workaround, message quality | tracked, not blocking |

Two consecutive waves with S1 = S2 = 0 end the loop. S3 findings go into one tracker Issue (as #309 did) and are fixed only when they reproduce twice.

### 3.6 Trusted-input integrity (G5) — approved 2026-10-13 (@nahisaho); implement as r30

Waves 17–19 S3 findings (#315) share one root cause: the gate trusts inputs (config, manifests/lockfiles, ledger, specs, approvals, artifacts) without validating or pinning them. Handle them in one mechanism instead of per-input patches.

1. **Input registry.** One table `TRUSTED_INPUTS` in `sdd.mjs`: `{kind, path/glob, schema, validator, hashed, failMode}` for `.sdd/config.json`, `.sdd/approvals.json`, `.sdd/tdd.jsonl`, specs, `artifacts`/`artifactProducers` targets, workspace manifests and lockfiles (Cargo/JS/Python roots). Every reader goes through `loadTrusted(kind)`; direct `readJson(CONFIG)` becomes a lint failure in the self-test.
2. **Schema validation (fail-closed).** Unknown enum values (`scopePolicy`, `specEditPolicy`, …), wrong shapes (`artifacts` as array), and unknown keys are errors with the key path; `gate`, `gate --changed` and `tdd check` all run it first.
3. **Pinned digest.** `gate` records `inputsSha` (per-kind sha, lockfiles included even if gitignored) in the ledger. `gate --changed --baseline` diffs it: any weakening change (policy, check definitions, test script narrowed, lockfile/workspace member change) is reported by kind; under `scopePolicy: strict` it fails unless `--allow-config-weaken`. Lockfile/manifest change widens to all members (§3.1 rule 2).
4. **Ledger tail anchor.** Record the head hash and entry count in `.sdd/tdd.head` (committed) at each append; `tdd check` fails when the ledger is shorter or the head does not chain. `merge-ledger` also reconciles `.sdd/approvals.json` (union by id, newest approval wins; stale ones need `approve record`).
5. **Messages.** Config-kind changes are reported as `config changed: <key>`, not "oracle dependency changed"; recorded-Red artifact producer declarations added later are applied by a single `tdd red --retest --all-affected`.

Acceptance: each §6/#315 area-5 repro (array `artifacts`, `scopePolicy:"off"`, truncated ledger tail, lockfile-only edit, narrowed test script, `UU` approvals.json) fails or reports by kind; a mutation test removes each `loadTrusted` call site and expects a self-test failure.

Out of scope: stub quality and weak-Red heuristics (separate rounds, §3.2/3.3).

## 4. Rollout

| Round | Content | Depends on |
|---|---|---|
| r24a | §3.1 scope confidence + workspace-root widening for Cargo/JS/Python; `unscoped` allow-list | r23c (#312) |
| r24b | §3.2 stub confidence markers + `tdd stub --report` (Rust first, then Python/TS) | r23a (#310) |
| r24c | §3.3 `weak` vs `suspect` split + ledger recording | r23b (#311) |
| r24d | §3.4 mapper differential + stub round-trip tests | r24a, r24b |
| r25 | hardening fixes found while landing r24 (stubs, weak-Red, scope) | r24 all |
| Wave 16 | 5 apps, judged by §3.5. Result: S1=0, S2=8, S3=55 — stop criterion **not met** | r25 |
| r26a-d | Wave 16 S2 fixes: #316 unmapped/unannotated files, #317 `refactor --stale`, #318 Rust stub signatures, #319 generated oracle + weak-Red helpers | Wave 16 |
| Wave 17+ | repeat until two consecutive waves have S1 = S2 = 0 | r26 |

Status: §3.1–§3.4 are implemented (§3.4 as `r24d` tests: scope differential per ecosystem, Rust stub round-trip with counted toolchain skips, ledger invariants).

Defaults: §3.1 rule 1 (fail on unscoped) is **on** for new `init`, off for existing `.sdd/config.json` (key `scopePolicy: "strict" | "warn"`, default `warn` when absent), flipping to `strict` once the §3.5 stop criterion is met. **On hold:** Wave 16 had S2 = 8, so the default stays `warn`.

## 5. Risks

- Strict scope may fail legitimate non-code changes (docs, CI files). Mitigation: default ignore globs (`**/*.md`, `.github/**`, `LICENSE`) plus `unscoped`.
- `SDD-TODO(stub)` markers may annoy for shapes that used to work. Mitigation: only for `guessed` elements; regression test that all currently supported shapes stay `shown`/`inferred`.
- Differential oracle cost: keep fixtures tiny and cap mutations.
- r23 and r24 touch the same functions; integrate r23 first.

## 6. Open questions

1. ~~`scopePolicy` default~~ Decided (2026-10-13, @nahisaho): existing projects stay `warn`; new `init` writes `strict`; default flips to `strict` once two consecutive waves have S1/S2 = 0 (Wave 16 did not qualify).
2. Should `suspect` Reds count toward the §3.5 S2 class?
3. Fixture licensing: may snippets from dogfood apps be committed?
