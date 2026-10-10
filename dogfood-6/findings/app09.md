# app09 (Julia) findings

## F1. Julia `tdd stub` writes a module-less file, so `using .Mod` tests still fail to load (Red rejected as load error)
Repro: Project.toml pkg; test/a_tests.jl: `include("../src/a.jl")` / `using .Ops` / `@testset "TEST-A-001" begin @test f(1)==2 end`; `S tdd stub TEST-A-001; S tdd red TEST-A-001`.
Actual: stub `src/a.jl` is bare `f(args...; kwargs...) = error(...)`; `tdd red` -> "RED REJECTED: load/compile error ... new module? run `tdd stub <ID>`" (`UndefVarError: Ops`); the suggestion is circular.
Expected: stub wraps in `module Ops ... end` (name from `using .Ops`/`import .Ops`) with `export`, or stubs.md ("PHP / Julia / R") says Julia stubs are flat files for plain `include` only.
Location: stubScript() sdd.mjs ~L986-1008 (`jl:` fn template, no module detection).
Workaround: hand-wrote module wrapper + exports.

## F2. Julia stub re-stubs functions already provided by other existing includes, and never stubs exception types
Repro: test/lu_tests.jl: `include("../src/sparse.jl")` (exists; defines `from_triplets`, `matvec`), `include("../src/lu.jl")` (missing), uses `@test_throws SingularMatrixError ...`; `S tdd stub TEST-LU-001`.
Actual: src/lu.jl gets `from_triplets(args...)=error(..)` and `matvec(...)=error(..)` (duplicates of sparse.jl's functions) but no `struct SingularMatrixError <: Exception`.
Expected: skip names defined in already-existing included files; generate exception structs for `@test_throws X`.
Location: sdd.mjs ~L990-1000: `defined` only scans the test source; the probe only checks `isdefined(Base, ...)`.
Workaround: hand-written stub.

## F3. Julia (whole-file runner): Red accepted for a test that already passes when a sibling test fails; message blames a wrong symbol
Repro (app09 test/lu_tests.jl, 7 tests all implemented+green): make only `solve_checked` throw `error("not implemented")`, then `S tdd red TEST-LU-001`.
Actual: `RED ok TEST-LU-001 ... fails with: not implemented: solve_checked [weak] ⚠ Red comes from setup call "solve_checked", not the asserted behaviour` -- Red recorded for a test that never fails.
Expected: Red rejected (TEST-LU-001 passes); e.g. require the failure output to name the target test's testset (Julia prints "Test Summary: TEST-LU-007 ...") or filter by id.
Conversely `tdd green TEST-LU-00x` is REJECTED for all 7 tests while only a sibling (007) failed, with no hint that a sibling failed.
Location: Julia testCmd L391 (whole file per run); Red/Green attribution ~L1399.
Workaround: checked by hand.

## F4. Julia `@test` failure reason shows stack tail, not the failing assertion
Repro: a failing `@test x ≈ y` / `@test_throws` in a testset; `S tdd green TEST-LU-001`.
Actual: `GREEN REJECTED TEST-LU-001: test failed` then `@ Test .../Test.jl:915 [2] top-level scope ...` (stack frames; the "Test Failed at file:line / Expression:" lines are cut) -- first line "test failed" is the whole reason; the failing testset (TEST-LU-007) is only visible in the summary.
Expected: show the `Test Failed ... Expression:` lines.
Location: failure-reason extraction (~L1399 and its helper).

## F5. Julia stub generates stubs for functions the test itself defines with `const f(x) = ...`
Repro: test file has `const F2(x) = [x[1]^2 - 4.0]` and `@test newton(F2, J2, [1.0]) ...` with `include("../src/newton.jl")` missing; `S tdd stub TEST-NEWTON-001`.
Actual: src/newton.jl contains `F2(args...; kwargs...) = error("not implemented: F2")`, `J2`, `FL`, `JL` (all test-local helpers) plus `from_triplets` (existing sparse.jl, see F2) and `newton`.
Expected: only `newton` stubbed.
Location: sdd.mjs ~L988 `defined` regex `^\s*([A-Za-z_]\w*)\(.*\)\s*=(?!=)` requires the line to start with the name, so `const f(x) =`, `local`/`global` prefixes are missed.
Workaround: hand-written stub.

(F5 addendum) Same stub run on a test with `f, g = Q` (tuple destructuring of a returned pair) then `f(x)`, `g(x)`: stub emits `g(args...)=error(..)` and `f(args...)=error(..)` for the local variables in src/gradient.jl (also `from_triplets` from the existing include). Location: same `called` scan, sdd.mjs ~L989; locals assigned from tuple-destructuring / lambda assignment aren't excluded.

## F6. impact / gate --changed cross-feature hint is blind to Julia (include / using ..Mod); docs imply generic support
Repro (app09): lu.jl/newton.jl/gradient.jl use `using ..SparseOps`; tests `include("../src/sparse.jl")`. Run `S impact src/sparse.jl`; also `echo "# x" >> src/sparse.jl; S gate --changed --no-run`.
Actual: "reaches 0 file(s) via imports", JSON reachedFiles:[] otherReqs:[] reachedTests:[]; gate --changed prints no "changed files imported by another feature" hint (only sparse's 8 tests re-checked).
Expected: reaches src/lu.jl, newton.jl, gradient.jl and their REQs/tests; hint listing lu, newton, gradient. Same for `impact src/result.jl` (shared by Newton and Gradient).
Location: import resolution used by impact (no .jl support); SKILL.md/enforced-rules.md list only JS/TS/Py/Go/Rust/Java/C/PHP, config.md lists Julia as supported stack with no caveat.
Workaround: manual reasoning; ran full gate.

## F7. Misleading messages: stale T2 lock refusal, and preamble-only test change
(a) After editing a locked T2 auto spec, `S tdd red <ID>` prints "REFUSED: T2 feature gradient approval is stale. run: approve prepare gradient". For approval:auto the needed command is `approve record gradient --by ai:<reviewer> --review ...` (prepare only prints that hint; docs say prepare is for human approvals). Location: stale-lock refusal text (grep "approval is stale").
(b) After changing only a preamble include(...) line of a test file, `tdd refactor TEST-X` warns "test body changed since the last Green; a refactor does not prove the new assertions" although no test body changed (preamble is inside every test's hash region). Expected wording: "test file preamble changed". One include line stales every test of the file.

## F8. Julia default check (Pkg.test()) fails with an infra error when no registry is available (offline)
Repro: Project.toml with [extras] Test + [targets] test = ["Test"] (standard layout), no registry/network: `S init; S gate`.
Actual: "✗ cmd test: ERROR: expected package `Test [8dfed614]` to be registered" -> gate FAIL (Pkg.test cannot resolve the stdlib offline).
Expected: fall back to `julia --project=. test/runtests.jl`, or a config.md Julia hint for offline setups.
Location: sdd.mjs L409.
Workaround: edited .sdd/config.json checks to run test/runtests.jl.

## F9. Red accepted for a load-time failure when the error is thrown by a stub at top level
Repro: test has `const Q = quadratic_problem(QA, QB)` at top level; stub throws error("not implemented").
Actual: `RED ok TEST-GRAD-001 ... fails with: ERROR: LoadError: not implemented: quadratic_problem` recorded as non-weak Red (no weak warning), while the identical shape in a testset body is flagged weak "setup call". Inconsistent: failure happened before any assertion/testset ran.
Expected: weak/setup warning (or consistent rejection as load error).
Location: Red classification near L1399 (setup-vs-assert heuristic only inspects testset bodies).

