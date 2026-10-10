# app24 (C# .NET 10 / MSTest parser-combinator + interpreter) findings

App: `dogfood-6/app24-cs-parser-mstest` (3 src + 3 MSTest projects, `.slnx`, local-feed `nuget.config` pointing at ~/.nuget/packages, MSTest 3.9.3).
`S="node /home/nahisaho/GitHub/musubix6/.github/skills/lean-sdd-tdd/scripts/sdd.mjs"`

## A1. MSTest/xUnit/NUnit `Assert.X(...)` is not recognised as an assertion → every C# Red whose stub is called inside an assertion is flagged "weak/setup"
Repro (MSTest): test `Assert.AreEqual("one", s.LineText(1));` where `LineText` is a throwing stub (`NotImplementedException`).
`$S --root . tdd red TEST-SRC-005`
Actual: `RED ok ... [weak] ⚠ Red comes from setup call "LineText", not the asserted behaviour` (the call is *inside* the assertion; same for `var p = s.PosAt(0); Assert.AreEqual(1, p.Line);`). 10 of my first 19 Reds were flagged weak; gate prints "10 weak Red".
Expected: the call is the act under test, Red not weak (rules doc claims xUnit `Assert.X()` support only for reason extraction).
Location: sdd.mjs l.1705 `ASSERT_LINE` — only lower-case `\bassert`/`assertEquals`; `Assert.` (capital A, all .NET frameworks), `Assert.ThrowsExactly`, `CollectionAssert.`, `StringAssert.`, `.Should()` not matched, so `markAsserts()` (l.1707) returns no asserted lines and `setupOrigin` (l.1724) falls to `return assertedResult(...) ? null : x`.
Workaround: `tdd red <ID> --allow-setup-red` (or `--expect <stub name>`).

## A2. Several test projects in one solution: `tdd red/green` REJECTS a genuine Red/Green ("no test matched the ID") because another project prints "No test matches the given testcase filter"
Repro: `.slnx` with 2+ MSTest projects (e.g. `tests/A.Tests`, `tests/B.Tests`); the test `TEST_X_001` lives only in A. `init` yields root `testCmd: dotnet test --nologo --filter FullyQualifiedName~{idu}`; `$S --root . tdd red TEST-X-001`.
Actual: `RED REJECTED TEST-X-001: no test matched the ID, or the test is skipped/todo` while the output right below shows `Failed TEST_X_001... Failed!  - Failed: 1, Passed: 0, ... Total: 1 ... A.Tests.dll` and `No test matches the given testcase filter ... B.Tests.dll`. Same for Green of a passing test.
Expected: Red/Green recorded (the ID matched in one project). Also `init` should create per-test-project `projects` (or doc this limit) for solutions with several test projects.
Location: sdd.mjs l.670 `ZERO_TESTS` (`no test matches`) vs l.667 `RAN_TESTS` has no VSTest summary pattern (`(Passed|Failed)!\s+- Failed:\s*\d+, Passed:\s*\d+, Skipped:\s*\d+, Total:\s*[1-9]`); l.1957 `zero = ZERO_TESTS && !RAN_TESTS`.
Workaround: hand-written `.sdd/config.json` `projects: [{root: tests/X.Tests, testCmd, checks}]` per test project (then `gate` also runs the root check again → duplicate runs; drop root `checks`).

## A3. Red caused by a *static field initializer* calling a stub is accepted as a normal (non-weak) Red
Repro: `static readonly Parser<char> Digit = P.Satisfy(char.IsDigit, "digit");` in the test class, `P.Satisfy` throws `NotImplementedException`; `$S --root . tdd red TEST-CMB-002`.
Actual: `RED ok ... fails with: System.TypeInitializationException: The type initializer for 'ParserKit.Core.Tests.CombinatorTests' threw an e...` — no weak warning (9 of 13 such tests recorded as strong Red although nothing was asserted).
Expected: weak/setup Red (it is a setup failure; also reason text is useless).
Location: sdd.mjs `setupOrigin` l.1724-1733: the `NotImplementedException` name regexes don't see the inner exception behind `TypeInitializationException`/`TargetInvocationException`; `line` has no match so it returns null (l.1731).
Workaround: none needed beyond using `--expect`; avoid static initialisers.

## A4. `tdd stub` (C#) writes the type into the test's namespace (`ParserKit.Core.Tests`) inside the production project
Repro: test file `namespace ParserKit.Core.Tests; using ParserKit; ... new Source("abc").PosAt(0)`, `Source` missing; `$S --root . tdd stub TEST-SRC-001`.
Actual: `src/ParserKit.Core/Source.cs` begins `namespace ParserKit.Core.Tests;` — compiles only because the test lives in that namespace; any other test project (`using ParserKit;`) can never see it, and the real impl must be moved to `ParserKit` by hand.
Expected: namespace from the test's `using` directive (stubs.md: "project that matches the `using` namespace").
Location: C# stub emitter (sdd.mjs, search `sdd-stub: throwing stub generated`).
Workaround: replace the stub by hand.

## A5. `tdd stub` C#: "! not stubbed:" list repeats the same member once per call site
Repro: test calls `new Failure(..).Describe(src)` five times, `Failure` is a real type in Parser.cs: `$S --root . tdd stub TEST-ERR-006`
Actual: `! not stubbed: Failure.Describe in ...Parser.cs; Failure.Describe in ...; Failure.Describe in ...; (x5)`.
Expected: de-duplicated list.
Workaround: ignore.

## A6. Docs: stubs.md does not say C# stubs skip generic types (`Parser<T>`); one static-field error blocks all tests of the class
Repro: `static readonly Parser<char> Digit = ...` (type `Parser<T>` missing) then `$S --root . tdd stub TEST-CMB-001` → `nothing could be stubbed ... ! CS0246 Parser<>: not stubbed (generic or unparseable)` for all 13 tests (the field belongs to the "shared preamble" of each).
Expected: stubs.md (C# paragraph) lists "generic types/methods are not stubbed" in Known limits.
Workaround: hand-written throwing skeleton.

## A7: `tdd stub` (C#) emits `public static class X {}` for a type used only as a helper return type -> CS0722 loop
Repro: MSTest file with helper `static ErrorInfo Err(string s) { var r = new Interpreter().Run(s); return r.Error!; }` and test calling `Err(...)`; `$S --root . tdd stub TEST-INT-001`.
Actual: generates `public static class ErrorInfo {}` (CS0722: static types cannot be used as return types); prints "stubbed (throwing)" then "! the test still does not compile"; re-running says "nothing could be stubbed" so the user is stuck with a bad file.
Expected: non-static class/record for types used as return/param/variable types (static only for member-access-only usage); never emit a stub that cannot compile.
Suspected: C# stub type emitter in sdd.mjs (static-class default for names seen only as `X.member`/helper signatures).
Workaround: delete generated file and hand-write skeleton.

## A8: `tdd stub` (C#) emits `dynamic` return/params -> lambda args fail with CS1977
Repro: test does `Recovery.ParseProgram(text, 10).Statements.Count(s => s is ErrorStmt)`; `$S --root . tdd stub TEST-REC-001`.
Actual: `public static dynamic ParseProgram(params dynamic[] _args)`; test still fails to compile: CS1977 (lambda on dynamic) and `ErrorStmt` CS0103 reported "not stubbed (a local name or helper, not a type)" although it is a type used in `is`/`IsInstanceOfType<ErrorStmt>`.
Expected: either infer types (`is X`, `IsInstanceOfType<X>` => type X) or document that dynamic stubs cannot serve LINQ lambdas.
Suspected: C# stub generation in sdd.mjs (dynamic fallback; type detection ignores `is T`/generic-arg uses).
Workaround: hand-written typed skeleton.

## A9 (usability): `review check <file>` without `--feature` prints only usage
Repro: `$S --root . review check .sdd/review-recovery.md` -> `usage: review template <feature> | review check <file> --feature <feature>`. SKILL docs show `review check <file>` in places; feature could be derived from the `spec:` hash/file header or the error should say "missing --feature".
