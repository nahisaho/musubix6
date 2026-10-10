# app15 findings (rust-regex, 6-crate cargo workspace)

## F1. Gate calls a `tdd red --retest` weak Red a "characterization" test
Repro (app15-rust-regex, TEST-VM-008):
```
# test expectation was wrong, Red passed/was weak; corrected the test, then:
$S --root . tdd red TEST-VM-008 --retest "wrong expectation for (|a)+"
$S --root . tdd green TEST-VM-008
$S --root . gate
```
Actual: `tdd evidence: 74/74 tests Red→Green, 1 weak Red (1 characterization: passed without a failing Red)`.
Expected: no `--characterization` was ever used; the message should say "1 retest" (the Red did fail before the retest).
Suspected: sdd.mjs line 388 `charac: !!(r.characterization || r.retest)` conflates the two; consumed at 2281/2284 for the label and for suppressing the "Red came from setup" hint.
Workaround: none needed (gate still passes); ignore the label.

## Observations (not filed as new defects)
- Weak-Red from helper-wrapped assertions (`fn m(p,s)=nfa(p).is_match(s)`) reproduced: same as app04 F1.
- `tdd stub` for Rust emits unit structs/enums for payload types (documented limit in stubs.md).
