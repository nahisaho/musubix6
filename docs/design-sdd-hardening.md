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
- G4 A bounded release-readiness criterion, separate from open-ended exploratory dogfooding.

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

### 3.5 Release readiness versus exploratory dogfooding (G4)

Decision accepted by @nahisaho on 2026-10-14: replace two clean **expanding exploratory waves** with two clean **fixed-scope validation runs**. Release readiness is evidence for a declared support contract, not a claim that all bugs have been found. This section defines coordinator workflow, not a new check mechanically enforced by `sdd.mjs`.

| Class | Examples | Release treatment |
|---|---|---|
| S1 | crash, gate false-pass, wrong Green accepted, data loss | No unresolved in-scope findings |
| S2 | wrong Red/stub that blocks and has no workaround | No unresolved in-scope findings |
| S3 | heuristic miss with a documented workaround, message quality | Tracked with workaround and residual-risk assessment |

#### Freeze the support and validation manifest before counting runs

Use one versioned manifest for the release candidate. Record its exact path and SHA-256, candidate source/packaged-artifact digests, and the following fields before the first qualifying run:

| Field | Required contents |
|---|---|
| Support contract | Languages, runner/reporter versions, OS/toolchains, command shapes, configuration grammar, trust boundaries and public compatibility promises |
| Fixed test matrix | Named regression/fixture IDs, commands, expected verdicts, positive controls, mandatory mutation/differential cases, environments and execution budgets |
| Input interpretation | Supported wrapper/package/plugin forms and explicit rejection tests for unresolved forms; documentation alone does not make silently accepted input safe |
| Evidence | Exact revisions/digests, environment versions, actual commands/exits, per-case outcomes, exclusions, findings and links to retained logs |
| Human-only cases | Prepare/refusal checks run automatically; successful human authorization requires a genuine authorized test event or is explicitly excluded from the guarantee and listed for release approval |

Freeze scope prospectively. It must cover the candidate's advertised guarantees; do not remove a supported case, weaken its oracle, or relabel an S1 as S3 merely to obtain a clean run. A narrower public support contract or policy relaxation needs explicit human approval and consistent user-facing documentation.

Every manifest revision records its reason and old/new hashes. Removing required cases/environments or weakening expected results also requires human approval, even when the public support wording is unchanged. Reclassifying an existing S1/S2 as S3 or out of scope requires recorded reproduction/scope evidence and human approval; it remains blocking until that decision is recorded.

Initial status after r34: **not yet frozen or validated**. The manifest must be populated from actual candidate support and evidence; this design change does not itself make the release ready. Prior exploratory waves do not retroactively qualify.

#### Release-readiness checks

1. Resolve every known in-scope S1/S2 and add its reproducer to regression coverage. Investigate uncertain scope or severity; neither an unclassified finding nor a silent PASS on an unresolved input is an exclusion.
2. Run the unchanged fixed matrix twice consecutively against the same candidate source/artifact digests and manifest hash, using fresh isolated execution state. Each run must cover every required cell with the expected verdict, including valid-input controls. A failed, missing, timed-out, skipped or unparseable required cell makes the run incomplete or failed, never clean.
3. Pass the integrated full regression suite and the mandatory mutation/differential cases. Verify every declared supported environment and the actual package/install entry point. Existing TODOs or toolchain skips are disclosed; they cannot substitute for a required matrix cell.
4. A candidate, package, manifest, expected-result or supported-environment change invalidates the two-run streak. A validation failure also resets it; after fixing, start again. A newly discovered in-scope S1/S2 blocks readiness even when found outside the fixed matrix.
5. Give the human release approver every exact artifact path/hash, manifest, run evidence, exclusions and residual risks. Technical readiness does not authorize tagging/publishing. `NPM_TOKEN` availability and the publishing account are checked without exposing credentials before the separate release approval.

Exploration may continue with new domains and input variants, but is no longer the release stop counter. New findings remain in the ledger with severity, reproduction, first violated condition, scope rationale and disposition. In-scope S1/S2 still block release; genuinely out-of-scope findings may be tracked separately only when the documented boundary and actual rejection behaviour agree. Expanding support creates a new manifest and requires revalidation, rather than moving an active validation target.

S3 findings remain in tracker #315 and normally receive a dedicated fix after two independent reproductions. They are not automatically harmless: escalate severity if impact warrants it, and present unresolved residual risks for release approval.

Alternative rejected: continuing to require zero S1/S2 in ever-expanding waves confounds exploratory yield with readiness and has no stable completion boundary. The fixed-matrix decision trades breadth of each qualifying run for reproducibility; continued exploration, package/environment checks and human residual-risk approval address, but do not eliminate, unknown-defect risk.

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
| Waves 17–24 | exploratory hardening; previous expanding-wave stop rule superseded by §3.5 on 2026-10-14 | r26 |
| Post-r34 validation | freeze the candidate/support manifest, then two clean fixed-scope runs and release approval under §3.5 | r34 integration and support-matrix preparation |

Status: §3.1–§3.4 are implemented (§3.4 as `r24d` tests: scope differential per ecosystem, Rust stub round-trip with counted toolchain skips, ledger invariants).

Defaults: §3.1 rule 1 (fail on unscoped) is **on** for new `init`, off for existing `.sdd/config.json` (key `scopePolicy: "strict" | "warn"`, default `warn` when absent). Existing-project behaviour is unchanged by this decision. A default flip requires §3.5 readiness evidence for the candidate containing the flip, explicit compatibility/migration documentation and human approval; readiness alone never flips runtime configuration.

## 5. Risks

- Strict scope may fail legitimate non-code changes (docs, CI files). Mitigation: default ignore globs (`**/*.md`, `.github/**`, `LICENSE`) plus `unscoped`.
- `SDD-TODO(stub)` markers may annoy for shapes that used to work. Mitigation: only for `guessed` elements; regression test that all currently supported shapes stay `shown`/`inferred`.
- Differential oracle cost: keep fixtures tiny and cap mutations.
- r23 and r24 touch the same functions; integrate r23 first.

## 6. Open questions

1. `scopePolicy` default: existing projects stay `warn`; new `init` writes `strict`. The 2026-10-14 decision supersedes the old expanding-wave trigger: evaluate a proposed flip under §3.5 with compatibility/migration evidence and human approval. No runtime default changes in this document update.
2. `suspect` Reds: advisory diagnostics alone are not S2. Classify observed incorrect behaviour under §3.5: blocking wrong Red without a workaround is S2; a heuristic miss with a documented workaround is S3. Record expected diagnostic/verdict behaviour in the matrix before freezing; do not use a late reclassification to erase a failed run.
3. Fixture licensing: may snippets from dogfood apps be committed?
