# app04 findings (rust-exprlang)

## F1. Weak-Red false positive when the asserted call goes through a helper fn (Rust, no `sites`)
Repro (minimal project kept in `findings/scratch04`):
```
src/lib.rs : pub fn f(_s:&str)->Vec<i32>{ unimplemented!("f") }
tests/t.rs : fn k(s:&str)->Vec<i32>{ f(s).into_iter().collect() }
             /** @id TEST-A-001 @verifies REQ-A-001 */
             #[test] fn test_a_001_x(){ assert_eq!(k("a"), vec![1]); }
$S --root findings/scratch04 tdd red TEST-A-001
```
Actual: `RED ok ... [weak] ⚠ Red comes from setup call "f", not the asserted behaviour`.
Expected: non-weak Red (the helper's result is the asserted subject; code even has the branch "if an assert line calls the helper → return null").
Cause: `setupOrigin` (sdd.mjs ~1254-1260): `helperVerdict()` returns `null` meaning "helper result is asserted", but the caller treats null as "no helper found" and falls through to line 1260, `assertedResult(bl.filter(re.test && !bf))` with an empty list → returns the symbol ⇒ weak. Only reached when the panic location is not in the test file (library panic, no `tests/t.rs:N` site). Same hit in dogfood app (TEST-LEX-002/003, multi-line `assert_eq!(kinds(..), vec![..])`).
Workaround: accept weak Red / `--expect`.

## F2. T2 `auto` spec refusal hint points only to the human flow
Repro: T2 spec (default `approval: auto`) with no lock, then `$S tdd red TEST-TYPE-001`.
Actual: `REFUSED: T2 feature type approval is missing. run: approve prepare type`
Expected: for non-`approval: human` specs the hint should say `approve record <feature> --by ai:<reviewer> --review <path|summary>` (SKILL.md "Autonomy model"); `approve prepare` is only the human path. Following the hint literally leads an agent to the human flow.
Location: sdd.mjs:1332 (`REFUSED: ... run: approve prepare`). Workaround: used `review template` + `approve record --by ai:reviewer --review file`.

## F3. Rust `impact`: cross-crate `use` resolved against every crate's lib.rs dir + method-name fallback => wrong reverse impact
Repro (this app): `$S impact crates/driver/src/error.rs` (leaf crate nobody depends on).
Actual: `tests: crates/driver/tests/driver.rs, crates/eval/tests/eval.rs, crates/syntax/tests/lex.rs, crates/syntax/tests/parse.rs, crates/types/tests/check.rs`, `other features: drv, eval, lex, parse, type`. (Also `impact crates/syntax/src/ast.rs` lists tests/lex.rs, which imports only `lexer` and `span`.)
Expected: only drv tests (nothing depends on exprlang-driver).
Cause: sdd.mjs:1947 for `use <extern_crate>::a::b` sets `bases` to the src dir of EVERY `src/lib.rs` in the repo instead of the crate whose package name matches `<extern_crate>` (Cargo.toml). If the module is not found there, the fallback at ~1957 links to any file under that base declaring `pub fn|struct|... <seg0>`: `use exprlang_syntax::span::Span` in tests/lex.rs matches `pub fn span(&self)` (a method) in crates/driver/src/error.rs => edge lex.rs -> error.rs. Over-approximation propagates through all features and also inflates the `gate --changed` "imported by other feature(s)" hint.
Workaround: ignore impact output for cross-crate Rust; rely on full gate.

## F4. Rust `tdd stub` reports "Red-safe" success but the test still does not compile; stub is derived from the whole test file, not the requested test
Repro (`findings/scratch04`, tests/t4.rs has TEST-A-009 using `use scratch04::zed::zap;` and TEST-A-010 using an inline path `scratch04::geo::Point { x: 1, y: 2 }`):
```
$S tdd stub TEST-A-010      # -> stubbed (throwing, Red-safe): src/lib.rs, src/zed.rs — now run: tdd red TEST-A-010
cargo test --no-run         # -> error[E0433]: cannot find `geo` in `scratch04`
$S tdd red TEST-A-010       # -> RED REJECTED: load/compile error ... new module? run `tdd stub <ID>` ...
```
Actual: stub creates `zed.rs` (needed only by TEST-A-009, unrelated to TEST-A-010), skips `geo`/`Point` (inline paths and struct-literal types are not handled), still claims "Red-safe ... now run tdd red"; the subsequent Red rejection tells the user to run `tdd stub` again (which they just did).
Expected: stub only for the requested test's symbols; warn "could not stub: geo::Point (struct literal/inline path) — write by hand" instead of "Red-safe"; the Red-rejection hint should not suggest stub when it was already run and produced nothing for the error.
Location: stubRust (sdd.mjs ~854-900, called at 1114) and the message at the Red rejection (~1370s). Workaround: hand-wrote stubs for all types (also needed for every payload enum / struct with fields in the main app: stub output `TokenKind::Int` unit variants, `Span` unit struct, `check<A0>(..)->Result<i64,String>`).
