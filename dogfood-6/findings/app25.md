# app25 (Julia reverse-mode autodiff) findings

## F1. (HIGH, false positive) Julia whole-file runner: `tdd red` accepts a Red for a test whose testset NEVER RAN (earlier top-level testset failure aborts the file); reason/`--expect` taken from the sibling
Repro (kept in `dogfood-6/findings/repro-app25-a`; two top-level `@testset`s, `uno()` is buggy, `dos()` is correct):
```
S="node /home/nahisaho/GitHub/musubix6/.github/skills/lean-sdd-tdd/scripts/sdd.mjs"; cd dogfood-6/findings/repro-app25-a
$S --root . tdd red TEST-R-002
```
Actual: `RED ok TEST-R-002 ... fails with: Expression: uno() == 1` (that is TEST-R-001's assertion). `julia --project=. test/t.jl` prints a Test Summary with only `TEST-R-001` — Julia aborts the file at the end of the first failing top-level `@testset`, so TEST-R-002 never executed (it would pass). Also `--expect <text>` is matched against the whole output, so a sibling's failure satisfies it (e.g. `tdd red TEST-TENSOR-003 --expect "not implemented: strides_t"` accepted while only TEST-TENSOR-001 ran).
Expected: REJECTED ("target testset TEST-R-002 did not run / is absent from Test Summary") — the existing "only in other test(s)" sibling check (juliaSiblingFail) needs to treat "target row missing from the Summary" as not-run; reason and --expect should be scoped to the target's testset.
Location: sdd.mjs ~L1850-1860 (juliaSummaryRows/juliaSiblingFail), ~L1958-1971 (Red accept).
Workaround: wrap all testsets of the file in one outer `@testset "feature" begin ... end` (then every inner set runs and appears in the table). Docs (config.md/enforced-rules.md Julia notes) should say to do this.

## F2. Julia `tdd stub` never appends to an already-existing included file → "nothing to stub" while functions are missing
Repro: test file has `include("../src/M.jl"); using .M` and two tests calling `f1()` / `f2()` (separate `@id`s); `tdd stub TEST-X-001` creates `src/M.jl` with `f1`; then `tdd stub TEST-X-002` prints `nothing to stub for TEST-X-002 ... write the missing code by hand` although `f2` is undefined anywhere.
Expected: append the missing `f2` throwing stub (and `export`) like the JS/TS "existing modules get missing exports appended" behaviour; or document it. This breaks the documented batch flow ("write all tests, then red each") for Julia: only the first test of a feature can be stubbed.
Location: stubScript, `loads = ... filter(abs => !fs.existsSync(abs))` (~L1303) — existing files are only read for `defined`.
Workaround: hand-write the stub module with all exported names.

## F3. Julia `tdd stub` ignores every call whose name ends in `!` (the Julia mutating convention)
Repro: test body `r = Rng(1); @test next_u64!(r) == 5` with `include("../src/Rng.jl"); using .RngMod` and no src file; `$S --root . tdd stub TEST-RNG-001`.
Actual: `src/Rng.jl` only contains `Rng(args...; kwargs...) = error(...)` + `export Rng`; `next_u64!` is not stubbed (nor `shuffle!`, `randn!`, `backward!`, `zero_grad!`, ...). Red then hits a missing name (UndefVarError => load-style rejection) — message says "compile NOT verified" only.
Expected: `!`-suffixed (and `?`-free) identifiers are Julia function names and must be stubbed.
Location: stubScript call regex `/(?<![\w$@.>:\\])([A-Za-z_]\w*)\s*\(/g` (~L1247): `\w*` stops before `!`, so `name!(` never matches. Same for the `defined` regexes (a test-defined `f!(x) = ..` is not recognised either).
Workaround: write the stub module by hand.

## F4. Julia `tdd stub` picks the wrong `module` name when the test includes several modules and some already exist
Repro: `test/t.jl`: `include("../src/A.jl"); include("../src/B.jl"); using .A; using .B; @test g() == 1` with `src/A.jl` existing (module A) and `src/B.jl` missing; `$S --root . tdd stub TEST-X-001`.
Actual: `src/B.jl` is written as `module A ... end # module A` (first `using .X`), i.e. redefines A's module name; wrong exports, and in real use it silently shadows/clobbers the real module. Seen in this app: stubbing `src/Tape.jl` produced `module Tensors`, `src/Ops.jl` produced `module Tensors` (test had `using .Tensors; using .TapeMod; using .Ops`).
Expected: module name from the `using .Mod` that corresponds to the missing include (match by file stem / by order among ALL includes), or the `module X` already declared in the file.
Location: stubScript, `const mod = [...using/import matches][Math.max(0, loads.indexOf(abs))]` (~L1306) — `loads` is filtered to NON-existing files, so the index no longer lines up with the list of `using` lines.
Workaround: hand-write the stub with the right module name.

## F5. Julia `tdd green <ID>` is refused (and shows another test's output) when an unrelated testset in the same file is Red
Repro: file `test/test_nn.jl` with outer `@testset "nn"` containing TEST-NN-001 (Green, passing) and a newly written TEST-NN-011 (failing, Red recorded). `$S --root . tdd green TEST-NN-001`.
Actual: `GREEN REJECTED TEST-NN-001: test failed` followed by the Test Summary table where only TEST-NN-011 has a Fail column (`60 passed, 3 failed`); TEST-NN-001 itself passed (7/7).
Expected: judge the target testset's own row in the Test Summary (as is already done to spot siblings for Red); at most a note that a sibling fails. The advertised workflow "write all tests, red all, then implement/green one by one" makes this the normal state, so a per-ID green cannot be done in isolation for Julia.
Location: sdd.mjs Julia green path (~L1958-1971 area, exit code of whole-file run is used as the verdict).
Workaround: green all IDs of the file after the last fix; run the whole set in one `tdd green A B C` call.

## F6. Weak-Red "setup call" verdict is inconsistent between tests failing at the identical expression
Repro: `test/test_train.jl` (8 tests, `src/Train.jl` stub throwing `error("not implemented: ...")` for all functions); `$S --root . tdd red TEST-TRAIN-001 ... TEST-TRAIN-008`.
Actual: all eight print `fails with: Expression: accuracy(m, X, [2, 1, 1, 1]) == 1.0` (a sibling's line, see F1), but 001/002/003/005/006/008 are flagged `[weak] Red comes from setup call "TrainConfig"` and 004/007 are not flagged, although 007 also calls `TrainConfig(...)` before the asserted behaviour.
Expected: weak flag decided from the target test's own first failure (or consistently from the reported one); the reported reason/expression should be the target's own.
Location: sdd.mjs weak-Red heuristic near the Julia Red accept path (~L1958-1990), uses the shared sibling expression.
Workaround: none needed beyond `--expect`; treat weak count in gate as informational.

## F7. `review check <file>` without `--feature` prints only usage, though `approve record --review <file>` infers the feature
Repro: `$S --root . review check .sdd/review-train.md` → `usage: review template <feature> | review check <file> --feature <feature>`.
Expected: infer feature from the `spec: sha256` header (approve already validates the same file) or say "--feature is required" explicitly.
Workaround: pass `--feature train`.
