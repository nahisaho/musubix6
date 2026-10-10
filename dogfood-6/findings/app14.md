# app14 (Go modules: kvwatch — MVCC KV, watch, lease, txn, compact) findings

Stack: Go 1.26, 5 packages, 55 REQs, 55 tests, 2 bug-fix + 3 refactor cycles. Final `gate` exit 0.
`S="node /home/nahisaho/GitHub/musubix6/.github/skills/lean-sdd-tdd/scripts/sdd.mjs"`

## F1. Go `tdd stub`: bare `New()` returns `*Pkg` even though the test passes the result to a helper typed `*pkg.Store`
Repro (tiny module `r1`, `go.mod` = `module r1`, spec `a` with REQ-A-001/002):
```go
// pk/pk_test.go (package pk_test)
func put(s *pk.Store, k string) { s.Put(k) }
// @id TEST-A-001 @verifies REQ-A-001
func TestTEST_A_001_x(t *testing.T) { s := pk.New(); put(s, "a"); if s.Count() != 1 { t.Fatal("bad") } }
```
`$S --root . tdd stub TEST-A-001`
Actual: `pk/pk.go` gets `type Store struct{}`, `type Pk struct{}`, `func New() *Pk`, `func (*Pk) Count()`, `func (*Store) Put(..)`; compile fails: `cannot use s (variable of type *pk.Pk) as *pk.Store value in argument to put`. Output ends "could not fully stub".
Expected: `New()` should return the type the test names for the value (`*pk.Store`, evident from the helper parameter / `*mvcc.Store` in signatures); methods called on `s` belong on `Store`.
Real case in app14: `mvcc.New()` → `*Mvcc`, `Put` on `Store`, `Rev/Get/Delete` on `Mvcc`; `const Reader = 0` for a type used in `func(mvcc.Reader) []mvcc.Op`.
Suspected: Go stub generator's "bare New() creates type Pkg" rule (see stubs.md "Go" bullet), not unified with types seen in helper params.
Workaround: hand-written throwing skeleton (compile-clean), then `tdd red`.

## F2. `tdd stub <TEST-ID>` (Go) is not scoped to the requested test (docs #130/#131 say it is)
Repro: same module, add
```go
// @id TEST-A-002 @verifies REQ-A-002
func TestTEST_A_002_y(t *testing.T) { if pk.Mode != pk.ModeFast { t.Fatal("bad") } }
```
`$S --root . tdd stub TEST-A-001` then `cat pk/pk.go`.
Actual: file contains `const Mode = 0` and `type ModeFast struct{}`, which come only from TEST-A-002 (also in app14: stubbing TEST-WATCH-001 generated `PrefixEnd`, `Watchers`, `Progress`, `ErrSlowWatcher`, `ErrCanceled` used only by other tests; stubbing TEST-STORE-001 generated `EventDelete`, `OpDelete`, `Reader`). `mvcc.EventDelete` in value position was emitted as a *struct type*.
Expected (stubs.md "stubs cover only the requested test (shared preamble + that test's body)"): only symbols used by the preamble + TEST-A-001.
Suspected: Go branch uses compile diagnostics of the whole `_test.go` file (`go test -run ^$`) instead of slicing the test region.
Workaround: hand-write the skeleton.

## F3. `tdd refactor` repeats the "test body changed since the last Green" warning after a Refactor was already recorded for the unchanged test
Repro (app14): add `"time"` import + a new test at the end of `mvcc/store_test.go`; `tdd refactor TEST-STORE-001` (warns, OK, recorded). Change only production code, do NOT touch the test file, run `tdd refactor TEST-STORE-001` again.
Actual: second run prints the same `⚠ TEST-STORE-001: test body changed since the last Green (includes the file preamble ...) ... use tdd red/green instead (#118)` even though the test hash equals the one recorded by the previous Refactor.
Expected: compare against the latest Green/Refactor evidence (the gate already does: "test changed since last Green/Refactor"); no warning when unchanged since the last Refactor.
Usability corollary: adding one import for a new test stales the evidence of every sibling test in the file (preamble is hashed) and the only non-Red path is a noisy `tdd refactor` per sibling (15 warnings).
Suspected: refactor warning compares to the last Green entry only. Workaround: ignore the warning.

## F4. Go `t.Skip()` test gets Red (characterization) and Green accepted
Repro (module r1, spec a with REQ-A-002):
```go
// @id TEST-A-002 @verifies REQ-A-002
func TestTEST_A_002_skip(t *testing.T) { t.Skip("later") }
```
`$S --root . tdd red TEST-A-002` → `RED REJECTED ... test passed; Red needs a real failure` (message says "passed", not "skipped")
`$S --root . tdd red TEST-A-002 --characterization x` → `RED ok [weak]`; `$S --root . tdd green TEST-A-002` → `GREEN ok`.
Actual: a skipped test yields Red→Green evidence (gate counts it 1 weak/characterization Red + Green).
Expected: SKILL/enforced-rules: "skipped tests cannot give Red/Green"; for Go the run (no `-v`) prints just `ok pkg` so skip is invisible. Should run with `-v` (or `-json`) and detect `--- SKIP`/`SKIP:`.
Suspected: skip detection exists for other runners; Go `testCmd` is `go test ./... -run ...` without `-v`. Workaround: do not use `t.Skip`.

## F5. `review template <unknown-feature>` exits 0 with placeholder hash; `review check --feature <unknown>` prints a misleading usage line
Repro (app14): `$S --root . review template nosuch; echo $?` → prints `spec: sha256:<spec sha256>` template, exit 0.
`$S --root . review check .sdd/review.md --feature nosuch; echo $?` → `usage: review check <file> --feature <feature>` (exit 2) although both args were given.
Expected: `no spec for feature nosuch` (exit non-zero) in both.
Workaround: check feature names with `plan`.
