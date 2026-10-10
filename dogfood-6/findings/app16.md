# app16 (rust-btree: pagefmt/btree/wal/mvcc/engine) findings

Script: `.github/skills/lean-sdd-tdd/scripts/sdd.mjs`. `S="node …/sdd.mjs --root ."`.

## F1. `tdd stub` (Rust) cannot stub `Type::new(..).unwrap()` / Option-returning methods; return types guessed as `i64`
Repro: `dogfood-6/findings/repro-app16-stub` (Cargo workspace, crate `d`, empty `lib.rs`), test:
```rust
use d::Tree;
#[test] fn test_d_001_empty() {
    let mut t = Tree::new(4).unwrap();
    assert_eq!(t.insert(1, 2), None);
    assert_eq!(t.get(1), Some(2));
}
```
`$S tdd stub TEST-D-001`
Actual: generates `pub fn new<A0>(_a0: A0) -> Self`, `insert(&self, ..) -> i64`, `get(..) -> i64`; still fails
`E0599 no method named unwrap found for struct Tree`. Also `&self` where the test needs `&mut`, and `== None` / `== Some(..)` comparisons are typed `i64`.
Expected: when the call chain continues with `.unwrap()/.expect()/?`, return `Result<Self, ()>`/`Option<..>`; when compared to `None`/`Some(x)`, return `Option<T>`; receivers bound with `let mut` should get `&mut self`.
Location: Rust stub generator (return-type inference, one `i64` default for all non-Self calls).
Workaround: hand-written stub with `unimplemented!()` bodies (honest message "could not fully stub" is shown).

## F2. Weak-Red (setup-origin) detection is inconsistent for identical setups
Repro (in app16-rust-btree, ledger `.sdd/tdd.jsonl`): stub `Store::new()` with `unimplemented!()`; tests all starting with `let mut s = Store::new();`
Actual: TEST-MVCC-001/003/005 flagged weak (setup:...), TEST-MVCC-002/004/006/007/008/010 with the same first line are not. Tests whose Red came from `BTree::new(..).unwrap()` in setup (BT-001..010) and via helper `log_of()` → `Wal::append` (WAL-009) were never flagged.
Expected: same setup-call panic → same verdict (either all flagged or none).
Location: `setupOrigin` sdd.mjs:1724 and its call at ~1979 (only inspects the first `E ... not implemented` line/frame; Rust panic location format differs from the pytest-style `^E` regex).
Workaround: none needed (weak Reds only listed); use `--expect <text>` for a definite Red.

## F3. `tdd red --retest` Reds are reported as "characterization: passed without a failing Red"
Repro: change a test expectation after Green, `tdd red TEST-BT-006 --retest "wrong expectation"`, `tdd green TEST-BT-006`, `$S gate`.
Actual: gate prints `(1 characterization: passed without a failing Red)`; the retest id is not listed in the weak ids either (hidden).
Expected: retest counted/printed separately (e.g. "1 retest") and listed, since it is not a data-only characterization test.
Location: sdd.mjs:388 `charac: !!(r.characterization || r.retest)`, message at ~2284.
Workaround: none (cosmetic/misleading).

## Not defects (verified working)
Multi-ID `tdd red/green`, `--retest`, stale-lock refusal after spec edit, `review template|check`, `approve record --review <file>|<summary>`, `impact` across crates, `gate --changed` auto-scope to `cargo test -p`.
Minor doc note: `review template` prints to stdout only (redirect it yourself); the default template has `verdict: pending` and a placeholder line, so `review check` refuses it until edited.
