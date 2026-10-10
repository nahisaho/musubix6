# app08 (C# .NET 10 / xUnit pricing engine) findings

Env: dotnet SDK 10.0.112, NuGet offline (packages cached in ~/.nuget; `dotnet new xunit` restore works but stalls ~2 min on network timeouts). App: `dogfood-6/app08-cs-pricing` (7 projects, 6 features, 39 REQ, full `gate` PASS).
`S="node /home/nahisaho/GitHub/musubix6/.github/skills/lean-sdd-tdd/scripts/sdd.mjs"`

## F0. Docs: ".NET not verified, dotnet unavailable" is stale/incomplete (docs gap, report only)
Verified here: `tdd red/green/refactor`, `gate`, `gate --changed`, `approve`, `review check` all work end-to-end with xUnit + `dotnet test --filter FullyQualifiedName~{idu}` (filter is case-insensitive, so `TEST_X_001_...` and `test_x_001_...` both match; the `{idu}` test-name fallback also works). Gaps are F1-F7 below. references/config.md should say verified + list the limits (no `tdd stub`, no impact graph, no weak-Red detection, `.slnx` unsupported).

## F1. `init` does not detect `.slnx` (default solution format of `dotnet new sln` in .NET 10)
Repro (`findings/repro-app08-b`): `printf '<Solution />' > R.slnx; $S --root . init`
Actual: `WARNING: stack not recognised ... testCmd is a Node fallback`, `testCmd: node --test ...`. With `R.sln` instead: `testCmd: dotnet test --nologo --filter FullyQualifiedName~{idu}`, checks: test.
Expected: same result for `.slnx`.
Location: sdd.mjs l.375 (`/\.(csproj|sln)$/`), l.416 MANIFESTS regex and l.418 ECO (`\.(csproj|sln)$`) – add `slnx`.
Workaround: hand-written `.sdd/config.json` (`testCmd: dotnet test tests/Pricing.Tests --filter ...`, `checks: dotnet test Pricing.slnx`).

## F2. `init` on a typical `src/*` + `tests/*` layout: every csproj (incl. test-less class libraries) becomes a "project" and the summary prints the Node fallback
Repro (`findings/repro-app08-a`: `R.slnx`, `src/Lib` classlib, `tests/T` xunit): `$S --root . init`
Actual: `projects: src/Lib (dotnet test), tests/T (dotnet test) ...` then `init ok: ... (testCmd: node --test --test-name-pattern {id} {file}; checks: none)` (root fallback printed although it is never used). With 6 libs in my app, `gate` would run 6 useless `dotnet test` checks in class libs (`src/Lib:test` passes with 0 tests, 1.1s each), and a test project referencing libs gets built multiple times. Expected: only projects that reference Microsoft.NET.Test.Sdk (or a solution-level check once); init message should print the effective per-project cmd.
Location: sdd.mjs init → nested-manifest discovery (MANIFESTS l.416, ECO l.418) has no notion of test vs non-test csproj.
Workaround: manual root `testCmd`/`checks` with explicit test project and solution path.

## F3. `tdd stub` for C#: says "no missing relative imports" and the Red rejection tells you to run `tdd stub` (circular advice)
Repro (`findings/repro-app08-a`, test uses `Lib.Calc` that doesn't exist):
`$S --root . tdd stub TEST-C-001` → `no missing relative imports in tests/T/CTests.cs` (nothing written)
`$S --root . tdd red TEST-C-001` → `RED REJECTED ... load/compile error ... new module? run \`tdd stub <ID>\` (or --missing-module)...` + `error CS0246: The type or namespace name 'Lib' could not be found`.
Expected: `tdd stub` says the language is unsupported (references/stubs.md lists no C#) or generates a throwing class; the Red rejection shouldn't recommend a command that no-ops. Also `--missing-module` can't match CS0246/CS0103 (not tried to confirm).
Location: sdd.mjs l.1320 (message emitted whenever stub dispatch (~l.1115) finds nothing, for unsupported extensions too); LOAD_ERR/Red hint l.1374.
Workaround: hand-written `NotImplementedException` stubs in each project, then `tdd red`.

## F4. `impact` / `gate --changed` cross-feature detection is blind to C# (`using Ns;` / project references)
Repro (app08): money's `Money.cs` is used by orders, tax, discounts, coupons, engine and every test file.
`$S --root . impact src/Pricing.Money/Money.cs` → `impl: ... verified by: TEST-MONEY-001..006` / `reaches 0 file(s) via imports`.
`$S --root . impact REQ-ENG-001` (Engine.cs uses all other projects) → `reaches 0 file(s) via imports`.
Edit Money.cs, `$S --root . gate --changed` → PASS with only money's evidence re-checked and **no** `! changed files are imported by another feature` hint (documented behaviour for other languages).
Expected: `using Pricing.Monetary;` resolved via `namespace` declarations (like the Java/PHP branches), or at least an explicit "impact graph not supported for .cs" note rather than a confident `reaches 0 file(s)`.
Location: sdd.mjs `importRev()` l.1895-1990 has no `.cs` branch; `TEST_FILE` (l.1471) has no `.cs` test pattern either (affects hub/changed-test selection l.1568, 1621).
Workaround: none; manual reasoning + always full `gate`.

## F5. Red "reason" is blank for common xUnit failures
Repro: test `Assert.Throws<ArgumentOutOfRangeException>(() => new PercentOffRule(...))` against a non-throwing stub, or `Assert.Equal(1, 2)`; also a Red caused by a real exception (`System.ArgumentException : weights must ...`, TEST-ENG-006).
`$S --root . tdd red TEST-DISC-007` → `RED ok TEST-DISC-007 (REQ-DISC-007) 4542ms` (no `— fails with:` text). Raw run shows `Assert.Throws() Failure: No exception was thrown` / `System.ArgumentException : ...`.
Expected: reason shown (and `--expect` works on it; the check itself uses full text so --expect is fine).
Location: sdd.mjs l.1384 reason regexp: `\w*Exception:` needs no space before the colon (xUnit prints `Exception : msg`), `expected` is case-sensitive (xUnit prints `Expected:`), and `Assert.X() Failure:` isn't matched.
Workaround: none needed (cosmetic) – read `dotnet test` output manually.

## F6. Weak-Red (stub-hit-in-setup) detection never fires for .NET; every Red is recorded non-weak
Repro (app08 `tests/Pricing.Tests/OrderTests.cs`, TEST-ORD-003): body = `var placed = OrderSupport.Reach(OrderStatus.Placed); Assert.Throws<InvalidOrderOperationException>(() => placed.AddItem(...))`. The throwing stub's `NotImplementedException` is hit by the *setup* helper (`TransitionTo`), the asserted call is never reached.
`$S --root . tdd red TEST-ORD-003` → `RED ok ... fails with: System.NotImplementedException : The method or operation is not implemented.` (no `[weak]`, no ⚠). `grep -c weak .sdd/tdd.jsonl` → 0 for all 85 entries although ORD-003/006/007/008, ENG-004 are clearly setup Reds.
Expected (references/enforced-rules.md "Stub Red"): weak Red + hint to use `--expect`.
Location: sdd.mjs `setupOrigin()` l.1196-1200: the symbol is extracted from the message (`not implemented: X` / `NotImplementedError` / `unimplemented!`); .NET's default `NotImplementedException` message ("The method or operation is not implemented.") has no member name, so `x` is null → returns null. Could fall back to the first stack frame (`at Ns.Type.Member(`) in the test output.
Workaround: stubs `throw new NotImplementedException("Order.TransitionTo")` do not help either (regex needs `not implemented:?\s*X`, the xUnit text is `System.NotImplementedException : Order.TransitionTo` → not matched). Not worked around.

## F7. `REFUSED ... run: approve prepare <f>` is wrong advice for `approval: auto` T2 specs
Repro: T2 auto spec locked, edit the spec (add REQ), `$S --root . tdd red TEST-ENG-006`
Actual: `REFUSED: T2 feature engine approval is stale. run: approve prepare engine`. Running it only prints a hint (`approval: auto — ... approve record <feature> --by ai:<reviewer> --review ...`) and doesn't change state.
Expected: message names `approve record <feature> --by ai:<reviewer> --review <...>` for auto specs (`approve prepare` is for `approval: human`).
Location: sdd.mjs l.1332.
Workaround: `approve record engine --by ai:rubber-duck --review "<summary>"`.

## Not defects / notes
- `tdd red` on a test whose method lacks the id works through the declared-method-name fallback; leaves ledger entries for removed tests (e.g. TEST-ENG-099 probe) that gate ignores (fine).
- Inline `/** @id CODE-X */ public static ...` on the same line as code is not scanned (documented "comment-leading lines only"); surprising for C# one-liners but per docs.
- `gate --changed` correctly fails (exit 1) when a code change breaks a test (verified by breaking Money.Round HalfUp), but its `tdd evidence (changed scope): 6/6 Red→Green` line stays green since evidence is test-hash based; only the `cmd test` check catches it (by design).
