# app13 (Go Raft-lite simulator) findings
App: 6 features, 66 REQs, 6 packages; 3 bug-fix cycles, 2 refactor cycles; final `gate` exit 0.

## F1. `tdd stub` (Go): prints "nothing to stub" (exit 0) but WRITES `<pkg>_stub.go` with wrong, non-compiling method stubs; methods called through a field selector get zero params
Repro (`findings/repro-app13-a`; calc/calc.go has `type Calc struct{}`, `func New(n int) *Calc`; test (`package calc_test`) has `type rig struct{ c *calc.Calc }` and calls `r.c.Add(2, 3)`):
`S=...sdd.mjs; $S --root . tdd stub TEST-C-001; echo $?; ls calc; go vet ./calc`
Actual: `nothing to stub for TEST-C-001 ... write the missing code by hand`, exit 0, yet `calc/calc_stub.go` is created: `func (*Calc) Add() any { panic(...) }`; vet: `too many arguments in call to r.c.Add`. Same for `r.n.Propose("x")` in the app (`Propose() error`, `CommitIndex() any`).
Expected: either a stub with `Add(a0, a1 any) any` (as for `c.Add(..)` on a local var) or an honest message naming the file it wrote; never "nothing to stub" while writing.
Location: sdd.mjs stubGo (l.840+) → caller l.1883-1889 (`made.length` is 0 for files written by the "extra method" pass, so the `else` branch prints "nothing to stub"); arg-count extraction ignores receivers of the form `x.f.M(...)`.
Workaround: delete the generated `*_stub.go`, hand-write the stub.

## F2. `tdd stub` (Go, external test pkg): bare `New()` creates a bogus `type <Pkg>` even when the test names the real type; struct literals lose all fields but the first
Repro (`findings/repro-app13-a`, remove `calc/calc.go`, test has `calc.Msg{From: 1, To: 2}`; app13 `rlog_test.go` has helper `func build() *rlog.Log { l := rlog.New() ... }`):
`rm calc/calc.go; $S --root . tdd stub TEST-C-001; cat calc/calc.go`
Actual: `type Msg struct{ From any }` (field `To` missing → `unknown field To in struct literal`); app13: `New()` returns `*Rlog` (new bogus type) while the test requires `*rlog.Log`, and methods are split between `Rlog` and `Log`; `Entry{}` empty though `rlog.Entry{Term:..,Cmd:..}` is used.
Expected: fields from the whole struct literal; `New()` should return the type that the test names (`*rlog.Log`), no duplicate bogus type (docs stubs.md l.7 only describes the bare-`New()`→Pkg rule when no other type is named).
Location: stubGo struct-literal field collection (only first `Field:` of a literal on one line) and the bare-New() rule (l.~840-990).
Workaround: hand-written stub.

## F3. `impact <REQ|file>` (Go) misses importers when the implementing file declares only methods (false negative)
Repro (`findings/repro-app13-b`): a/t.go `type T struct{}; func New() *T`; a/m.go (annotated CODE-FA-001 @implements REQ-FA-001) only `func (t *T) M() int`; b/b.go imports a and calls `a.New().M()` (REQ-FB-001).
`$S --root . impact REQ-FA-001`  (same for `impact a/m.go`)
Actual: `reaches 1 file(s) via imports; tests: a/a_test.go` — feature fb not listed. `impact a/t.go` does list fb (`! other feature REQ-FB-001`).
Expected: fb/REQ-FB-001 reached (b calls a.T's method M declared in m.go; a is imported). Real app: `impact REQ-REPL-007` / `impact node/replication.go` (methods only) never reach `sim`, which calls `Propose`/`CommitIndex`; `gate --changed` hub hint relies on the same graph.
Location: sdd.mjs Go import resolution ("files declaring the used symbols", ~l.585-640 using `go list` deps): top-level-declaration index ignores method declarations (`func (r T) M`).
Workaround: run `impact` on the file declaring the type, or full `gate`.

## F4. Go Red caused by a panicking stub in test SETUP is never marked weak (docs: "throwing stub hit by a setup call ⇒ weak")
Repro (`findings/repro-app13-c`, calc.go has `func New() *Calc { panic("nyi: New") }`, test: `c := New(); if c.Mul(2,3) != 6 {...}`):
`$S --root . tdd red TEST-C-002`  (also with helper `func mk() *Calc { return New() }`)
Actual: `RED ok ... fails with: --- FAIL: TestTEST_C_002_mul` — not weak, no setup warning; the panic is in `New()` before any assertion. In app13 all 9 NET, 12 ELECT, 12 SIM Reds (panic inside `newRig`/`newH`/`sim.New`) were recorded as normal Reds and gate shows no weak Reds.
Also `fails with:` shows only the `--- FAIL:` line, hiding the actual `panic: nyi: New` text.
Expected: `[weak] ⚠ Red comes from setup call "New"`, as for other languages; `fails with:` should show the panic message.
Location: weak/setup heuristic (~l.1982-1993) has no Go branch / `fails with` extraction prefers `--- FAIL:` over `panic:` when both occur.
Workaround: `--expect <assert text>` (rejects setup panics).

## F5. `tdd red --retest` is counted and labelled as "characterization" in gate; weak IDs are not listed
Repro (`findings/repro-app13-c`): Red a test; edit the expectation; `tdd red TEST-C-001 --retest "wrong expectation"`; `tdd green TEST-C-001`; `$S --root . gate`
Actual: `tdd evidence: 1/1 tests Red→Green, 1 weak Red (1 characterization: passed without a failing Red)` — nothing was recorded with `--characterization`, and the weak ID is not listed (the list is only printed when weak > charac).
Expected: separate "retest" count (or list the ID) so reviewers can find which test was re-recorded.
Location: sdd.mjs l.388 (`charac: !!(r.characterization || r.retest)`), l.2284 message.
Workaround: none needed (cosmetic); grep `.sdd/tdd.jsonl` for `retest`.
