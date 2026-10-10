# app23 (C# / NUnit, fraud scoring) — findings

Stack: .NET 10, NUnit 4.3.2, multi-project solution (Core, Dsl, Velocity, Scoring, Audit, Decision). 5 features, 52 REQs. Final `gate` exit 0.

## F1. `tdd stub` ignores CS1501 (LINQ-name collision), member not stubbed
Repro: test calls `trail.Append("a","b","c","d")` on a stubbed `AuditTrail` lacking `Append`; `$S tdd stub TEST-AUD-001`.
Actual: `! CS1501 ... No overload for method 'Append' takes 4 arguments — not stubbed`. Expected: add `Append` (names such as Append/Count/Select/Where collide with LINQ extension methods so Roslyn reports CS1501 instead of CS1061).
Location: stubCs diagnostic switch (~sdd.mjs:1496) handles only CS1061/CS0117 for members.
Workaround: write the member by hand.

## F2. `{idu}` (lowercased) breaks NUnit/xUnit `FullyQualifiedName~` filter (case-sensitive)
Repro: NUnit method `TEST_VEL_001_x`, default `init` config (`--filter FullyQualifiedName~{idu}`); `$S tdd red TEST-VEL-001`.
Actual: `no test matched the ID`; `dotnet test --filter FullyQualifiedName~test_vel_001` finds nothing, `~TEST_VEL_001` works. Expected: works (config.md says NUnit/xUnit work through the filter).
Location: testName() ~sdd.mjs:1810-1824 (`text.toLowerCase().includes(idu)` returns lowercase spelling), default C# testCmd template.
Workaround: use `{IDU}` in testCmd.

## F3. Stub types placed in the wrong project/namespace
Repro: test file has `using Fraud.Audit; using Fraud.Core; using Fraud.Decision;`; types IllegalTransitionException/CaseState/ManualClock are missing; `$S tdd stub TEST-DEC-004`.
Actual: `IllegalTransitionException.cs` and `CaseState.cs` created in `src/Fraud.Audit` (first non-resolving `using`), not the Decision project that the test's `using Fraud.Decision` and the ProjectReference point to; earlier ManualClock landed in Audit/Velocity and left an empty `Namespace.Fraud.Core.cs`. Enum only got the members used by that one test (Pending, Approved).
Location: pickNs ~sdd.mjs:1420 prefers `cand[0]`.
Workaround: delete generated files, write stubs by hand.

## F4. C# `Assert.That/Assert.AreEqual` not recognised as assertion by weak-Red heuristic
Repro: test `var h = AuditHasher.Compute(..); Assert.That(h, Is.EqualTo(..));` with throwing stub; `$S tdd red TEST-AUD-003`.
Actual: `[weak] ⚠ Red comes from setup call "Compute"` (11 weak Reds in this app even where the call IS the behaviour under test; `Open` in DEC tests also flagged). Expected: not weak when Assert follows the act.
Location: ASSERT_LINE ~sdd.mjs:1710 uses lowercase `\bassert` only.
Workaround: `--expect "<stub message>"`.

## F5. Stub generator cannot add members to its own exception stubs; misleading, duplicated message
Repro: test uses `ex.Line`/`ex.Col` of `DslException`; `$S tdd stub TEST-DSL-002` twice.
Actual: `not stubbed: DslException.Line in src/Fraud.Dsl/DslException.cs (exception/record stubs are fixed) ... those modules hold real code, which stub never edits` — the file carries the `// sdd-stub` marker (not real code), and Line/Col are each listed twice. Same for `IllegalTransitionException.From/To` (F3 run).
Location: addMember ~sdd.mjs:1450.
Workaround: hand-write the exception.

## F6. `dynamic`-typed stubs break common constructs (undocumented)
Repro: any test using a `with` expression on a stub record or passing a lambda to a stub call (`.Select(x => ...)` on the result).
Actual: CS8858 / CS1977 compile errors, so Red is a load error. Expected: typed stubs or a note in references/stubs.md.
Workaround: hand-written typed stubs.

## F7. NUnit collection-assert failure yields empty `fails with:` reason
Repro: TEST-DSL-001 / TEST-SCO-004 Red (`Expected is <String[4]>, actual is <...> Values differ at index [0]`).
Actual: `RED ok ... — fails with:` (blank). Expected: first failure line.
Location: reason extraction ~sdd.mjs:1985 (specificReason / regex list lacks NUnit "Expected is").

## F8. Red accepts a `tdd` run that timed out (hung testhost) as a valid Red
Repro: transient dotnet testhost hang (also hit twice as `Fatal error. Internal CLR error (0x80131506)` / `spawnSync dotnet ETIMEDOUT` on first test after rebuild). Deterministic repro: set `"timeoutMs": 1` in .sdd/config.json and run `$S tdd red TEST-X` on a failing test.
Actual: `RED ok TEST-DEC-004 (REQ-DEC-004) 120101ms` recorded in the ledger as valid Red with empty reason (observed live); on Green the same hang gives `GREEN REJECTED: test failed` with the CLR crash text, which is misleading. Expected: `REJECTED: timed out after Ns` for both (res.timedOut is computed but never checked).
Location: run1 ~sdd.mjs:505 returns `timedOut`; tdd red/green branch ~1948-1975 never consults it (exit = `r.status ?? 1`).
Workaround: rerun the test; for Red check duration.

## F9 (low). Missing-commit gate message
`gate --changed` before any git commit warns `cannot scope changes for {changedTestProjects} — running the full check` without saying the repo has no commit yet. Workaround: commit once.
