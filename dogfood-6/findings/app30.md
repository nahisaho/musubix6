# app30 (go-rust-polyglot) findings

Script: `.github/skills/lean-sdd-tdd/scripts/sdd.mjs` (2723 lines). `S="node …/sdd.mjs"`; app: dogfood-6/app30-go-rust-polyglot (Go service + Rust crate + shared `contract/`).

## F1. `tdd green|red` REJECTED output for Rust drops the assertion message (left/right values)
Repro: Rust crate, test `fn test_x_001() { assert_eq!(f(), 50); }` where f()==51, then `$S --root . tdd green TEST-X-001` (after a Red).
Actual: `GREEN REJECTED TEST-X-001: test failed` followed only by `note: run with RUST_BACKTRACE=1 …`, `failures:`, `test result: FAILED`, `error: test failed, to rerun pass --test x` — no `panicked at …`/`left: …`/`right: …` lines, so the agent must re-run cargo by hand to see why.
Expected: the `assertion `left == right` failed` + left/right lines (the Red message `fails with:` does print them).
Location: sdd.mjs:100 `REASON_KEY` is case-sensitive (`Assertion\b.*\bfailed`), Rust prints lowercase `assertion `left == right` failed`; `rejectTail` (107-113) then falls back to the last lines.
Workaround: `cargo test <name>` manually.

## F2. `tdd red --retest` is reported as "characterization: passed without a failing Red" in gate
Repro: Red+Green a test, fix a wrong expectation in the test, `$S --root . tdd red TEST-X-007 --retest "expectation ignored bucket width"`, `tdd green TEST-X-007`, `$S --root . gate`.
Actual: `✓ tdd evidence: 15/15 tests Red→Green, 1 weak Red (1 characterization: passed without a failing Red)` although nothing is a data-only/characterization test.
Expected: separate `1 retest` wording (retest has `weakWhy:'retest'`).
Location: sdd.mjs:388 (`charac: !!(r.characterization || r.retest)`) feeding the message at sdd.mjs:2284.
Workaround: none needed (cosmetic, but misleading in audit).

## F3. Go `impact` ignores imports when go.mod lives in a subdirectory (`go/go.mod`, module path ≠ repo path)
Repro (monorepo with `go/go.mod` module `example.com/metrics`; `go/rollup/rollup.go` imports `example.com/metrics/contract`; `go/contract/contract.go` exists):
`$S --root . impact go/contract/contract.go`
Actual: `reaches 1 file(s) via imports; tests: go/contract/contract_test.go` — ingest and rollup (which import contract) are not reached, no "other feature" warning. (Rust `impact rust/src/hist.rs` correctly warns about window.)
Expected: reaches go/ingest/ingest.go, go/rollup/rollup.go and their tests / other-feature REQs.
Location: sdd.mjs:2560 — `m[2] === d || m[2].endsWith('/' + d)` compares the import path to the repo-relative dir (`go/contract`); `example.com/metrics/contract` never ends with `/go/contract`. Module prefix from go.mod (as done in stub code at sdd.mjs:886-889) is not used.
Workaround: none (manually inspect imports). Also `impact contract/vectors.tsv` says `reaches 0 file(s)` although `projects[].dependsOn` makes `gate --changed` run both projects (impact ignores dependsOn).

## F4. `tdd stub` (Go) invents a wrong receiver type and bogus helpers when the test file uses a helper taking `*Engine`
Repro: `go/rollup/rollup_test.go` with `func mustAdd(t *testing.T, e *Engine, p ingest.Point)` and tests calling `e := New(cfg, Options{}); mustAdd(t, e, ...); e.Roll(); e.Snapshot()`; run `$S --root . tdd stub TEST-ROLLUP-001` (sample output saved in findings/app30-rollup-stub-sample.go.txt).
Actual: `New` returns `*Rollup` (package-name-derived) while `Engine` is declared separately; methods are split between `*Engine` (Add only) and `*Rollup` (Get/Roll/Snapshot/Evict); a bogus top-level `func Get() GetResult` and `type GetResult` are emitted; all params `any`, `Retention any`. Stub does not compile ("cannot use e (variable of type *Rollup) as *Engine value").
Expected: constructor returns the type the test passes to a helper (`*Engine`) or at least one receiver type for all methods.
Workaround: hand-write the throwing stub (delete generated file first); then `tdd red --expect "not implemented"`.

## F5. Weak-Red "setup call" heuristic flags the act when the act is wrapped in a helper
Repro: tests `mustAdd(t, e, pt(...))` (helper calling `e.Add`) then asserting `e.Get(...)`; throwing stub panics in `Add`.
Actual: `RED ok ... [weak] ⚠ Red comes from setup call "Add", not the asserted behaviour` for 11/13 tests, including TEST-ROLLUP-001/003 where Add is the behaviour under test (REQ-ROLLUP-001/003 are about Add).
Expected: no flag (or only when the panic frame is outside the asserted REQ's API), or documented that helper-wrapped acts always need `--expect`.
Workaround: `tdd red ID --expect "not implemented"`.
