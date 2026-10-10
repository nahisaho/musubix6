# app03 (Go rate limiter) findings

## F1. `tdd stub` (Go, external `package x_test`) emits `const ErrX = 0` for sentinel errors → stub never compiles
Repro (`findings/repro-app03-a`, go.mod `example.com/r`, `calc/calc_test.go` with `package calc_test`):
```go
if _, err := calc.New(0, 1, nil); !errors.Is(err, calc.ErrBad) { t.Fatal(err) }
```
`S=...sdd.mjs; $S --root . init; $S --root . tdd stub TEST-C-001; go vet ./calc`
Actual: stub has `const ErrBad = 0`; vet: `cannot use calc.ErrBad (constant 0 of type int) as error value`. Stub reports success.
Expected: `var ErrBad = errors.New("ErrBad")` (the in-package branch does this for `Err[A-Z]`; the external-package branch doesn't).
Location: sdd.mjs stubGo external branch, ~l.760-790 (`render` only emits `e.consts`; `else { e.consts.add(n) }` in the `undefined: alias.X` loop has no Err handling like the l.~812 in-package loop).
Also: message prints the same path twice: `stubbed (throwing, Red-safe): calc/calc.go, calc/calc.go` (made.push for ext file and again for `target`, ~l.790/l.847).
Workaround: hand-written throwing stubs.

## F2. `tdd stub` (Go, external test pkg), method call on constructor result: in-package pass clobbers the stub with garbage (`New()` zero-arity, `NewResult`)
Repro (`findings/repro-app03-a`, `rm calc/calc.go` first), test body:
```go
c, err := calc.New(1, 3)
if err != nil { t.Fatal(err) }
if !c.Allow() { t.Fatal("no") }
```
`$S --root . tdd stub TEST-C-001; cat calc/calc.go; go vet ./calc`
Actual: calc.go = `type NewResult struct{}` + `func New() error { panic }`; vet: `too many arguments in call to calc.New`. Stub claims success. (In the real app a bogus `func bucket() any` was also generated, and a 2nd run created `bucket_stub.go` with `const ErrInvalidConfig = 0`.)
Expected: compiling stub (`New(a0, a1 any) (*T, error)` etc.) or an honest "could not stub" message.
Location: stubGo: the external branch writes `e.file` (`<pkg>.go`) but `target` (l.~733) is the same `<pkg>.go`; the second, in-package loop (l.~808+) then renders over it using the `package x_test` source (imported pkg is the same dir). A same-dir external test package (idiomatic Go layout) is treated both as "imported external pkg" and "own package".
Workaround: hand-written throwing stubs.

## F3. Go `tdd stub` constructors panic → Red comes from setup (`New`), many Reds recorded `[weak]`; docs promise a "real, non-weak Red"
Repro: in-package test (`package pq`) `q := New(); q.Push("low",1); q.Push("high",9); got, ok := q.Pop(); if !ok || got != "high" {...}`; `tdd stub TEST-PQ-001; tdd red TEST-PQ-001`.
Actual: stub is `func New() *Pq { panic("not implemented: New") }`; `RED ok ... fails with: panic: not implemented: New [recovered, repanicked] [weak] ⚠ Red comes from setup call "New", not the asserted behavior` (6 of 8 tests in my pq feature were weak; TEST-PQ-004/007 inconsistently not flagged).
Expected: stub constructors `New*` return a zero value (`return &Pq{}`) so only behaviour methods panic (references/stubs.md: "Writes throwing stubs so `tdd red` is a real, non-weak Red").
Location: sdd.mjs stubGo `render` (~l.738-742): constructors go through the same `panic(...)` body as other funcs.
Workaround: edit the stub's `New` to `return &Pq{}`, re-run `tdd red` (same test hash, so allowed).

## F4. `approve record` on a T1 spec prints "locked" but the lock is never verified (edited spec → gate PASS, no lock line)
Repro (`findings/repro-app03-b`): T1 spec q.md; `approve record q --by ai:rev --review ok` → `locked q by ai:rev: .sdd/specs/q.md`; edit the spec (`sed -i 's/return 0/return zero/' .sdd/specs/q.md`); `gate` shows no lock/stale line, `status` shows `q:T1:n/a`. (Same in the app: pq was locked as T1, then reworded; gate showed nothing about the lock.)
Expected: refuse/warn "T1 specs are not lock-enforced" at record time, or gate reports `lock q: stale`. SKILL.md §3 says only T2/approval:human are locked, but the `locked` message is misleading.
Location: approve record (accepts any tier) vs gate lock section (T2/human only).

## F5. `gate --changed` in a repo with no commits: "cannot scope changes for {changedGoPkgs}" although untracked Go files are in known packages (low)
Repro (`findings/repro-app03-b`, before first `git commit`): `gate --changed` → `! cmd test: cannot scope changes for {changedGoPkgs} — running the full check`. After the first commit, an edit to q/q.go gives `scoped → go test example.com/b/q`, and even a brand-new untracked package dir is scoped. Only the no-HEAD case falls back (evidence part does see the files).
Expected: scope like the post-commit case, or hint to commit once.
Location: sdd.mjs ~l.1769 (scope placeholder empty) / changed-file collection when HEAD is missing (~l.443).
