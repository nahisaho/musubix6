# app05-java-ledger findings (sdd.mjs)

## F1. `tdd stub` (Java) emits non-compiling stubs: static factories return `int`, chained/typed use ignored
Repro (clean Maven project, test `ledger-money/src/test/java/ledger/money/MoneyTest.java`):
```java
Currency usd = Currency.of("USD");          // typed declaration
assertEquals(2, Currency.of("USD").digits());
Money a = Money.of(new BigDecimal("1"), usd); a.add(a); Money.zero(usd)
assertThrows(CurrencyMismatchException.class, ...)
```
`node sdd.mjs --root . tdd stub TEST-MONEY-001` -> writes `Currency { public static int of(Object a0) }`, `Money { static int of(Object,Object); static int zero(Object) }`.
Actual: stub compiles-fail the test (`int cannot be dereferenced`, `incompatible types: int cannot be converted to Currency`); no `digits()`/`add()`/`amount()` etc. instance methods stubbed for results of static factory calls; `CurrencyMismatchException` (used in assertThrows) not stubbed; `tdd red` then says "load/compile error".
Expected: since `Currency usd = Currency.of(..)` declares the type, return type should be `Currency` (or at least the class itself for static factories named of/create/from), and referenced exception classes created.
Suspect: Java stub generator in sdd.mjs (return type fallback `int`; instance-method stubbing only for `new X(..)` receivers per references/stubs.md).
Workaround: hand-written throwing stubs.

## F2. `tdd green` REJECTED (Maven) hides the actual assertion failure
Repro: JUnit test with a wrong expectation, `tdd green TEST-MONEY-002`.
Actual output: only Maven boilerplate (`[ERROR] Please refer to .../surefire-reports ...`, `[Help 1] ... MojoFailureException`, `mvn <args> -rf :ledger-money`). The line `expected: <3> but was: <2>` is not shown.
Expected: show assertion message (as `tdd red` does "fails with: ...").
Suspect: sdd.mjs:1384 `out(tail(res.text, 12))` for rejected red/green uses plain `tail`; `failTail` (line 97) is not used here (and its regex would not pick `expected:` either).
Workaround: ran mvn manually with the same -Dtest filter.

## F3. Java `tdd stub`: wrong return types for chained calls / enum comparisons; constructors never throw
Repro: `ChartTest` (ledger-accounts) containing
```java
Account a = new Account("1000","Cash",AccountType.ASSET,USD);
assertEquals(AccountType.ASSET, a.type());
assertEquals("Cash", c.find("1000").name());
c.add(acct); c.add(acct, "1000");     // 1-arg and 2-arg overloads
```
`tdd stub TEST-ACCT-001` generated: `int type()`, `String find(Object)` (the `"Cash"` literal belongs to `.name()` of the *result* of find), `int add(Object)` only (no 2-arg overload), `Account(String,String,Object,Object) {}` (empty ctor body: never throws; `Object` for enum/Currency params although types are known from the test).
Expected: `AccountType type()` (compared to enum constant), `find` result should allow `.name()`, overload `add(Object,Object)`.
Result: stub does not compile (`String cannot be dereferenced`, `cannot find symbol name()`). Suspect: Java stub heuristic in sdd.mjs infers return type from the literal on the same assertion line without checking the call is the outermost expression.
Workaround: hand-written stubs.

## F4. Maven auto `changedCmd` (`-pl <changed> -am -amd`) fails on diamond dependencies (false FAIL)
Repro: reactor with modules money, accounts(->money), audit, journal(->money,accounts,audit). Change only `ledger-accounts/src/...`, run `node sdd.mjs --root . gate --changed`.
Actual: `! cmd test: scoped → mvn -B -ntp test -pl ledger-accounts -am -amd -DfailIfNoTests=false` then `✗ cmd test` with `Could not resolve dependencies for project ledger:ledger-journal ... Could not find artifact ledger:ledger-audit:jar:1.0.0 in central`. Gate FAIL although code is fine; `mvn test` (full) passes.
Cause: `-amd` adds dependents (journal, period) but `-am` only applies to the listed modules, not to the dependents' *other* upstream modules (audit), so those are outside the reactor and unresolvable (no `install`).
Expected: scoped command must include upstream deps of dependents (e.g. compute transitive closure: changed + dependents + their deps) or fall back to full run; docs (config.md) claim "multi-module Maven works" / `-pl <changed modules> -amd`.
Suspect: Maven changedCmd default (`{changedModulesCsv}` expansion, `-am -amd`) in sdd.mjs config detection/init.
Workaround: set `changedCmd` in .sdd/config.json to full `mvn -B -ntp test -DfailIfNoTests=false`.

## F5. Stale T2 lock on an `approval: auto` spec: `tdd red/green` REFUSED tells the wrong next command; Java stub cannot add a missing overload
(a) Repro: lock an auto T2 spec (`approve record journal --by ai:x --review "..."`), append a REQ row to `.sdd/specs/journal.md`, then `node sdd.mjs --root . tdd red TEST-JRNL-012`.
Actual: `REFUSED: T2 feature journal approval is stale. run: approve prepare journal`.
Expected: for `approval: auto` the fix is re-review + `approve record journal --by ai:<reviewer> --review ...`; `approve prepare` is the human-approval step (it does eventually print the right hint, but only as a second step).
Suspect: sdd.mjs:1332 (message ignores `spec.approval`).
(b) Repro: test calls a new overload on an existing Java class (`lg.reverse(e.id(), later)` while `Ledger` only has `reverse(long)`); `tdd stub TEST-JRNL-012` prints `no missing relative imports in .../LedgerTest.java` and writes nothing. Expected: either append the missing `reverse(long, LocalDate)` method (stubs.md claims existing JS/TS modules get methods appended; Java instance methods on `new X(..)` receivers) or say "Java stubs cannot extend existing classes". The message is misleading (the test doesn't compile). Subsequent `tdd red` reports a compile error, which is correctly rejected, but the hint "run tdd stub" would loop. Workaround: hand-write the overload that throws.

## F6. Gate hint for weak Reds ("re-run `tdd red <ID> --expect <text>`") is not actionable after Green
Repro: any weak Red that is already Green (here TEST-ACCT-001); `node sdd.mjs --root . gate` prints `✓ tdd evidence: 39/39 tests Red→Green, 13 weak Red — Red came from setup/load ... re-run tdd red <ID> --expect <text> where the failure is real`. Then `tdd red TEST-ACCT-001 --expect "not implemented"`.
Actual: `RED REJECTED TEST-ACCT-001: test passed; Red needs a real failure (data-only / characterization test? ...--characterization ...)` followed by 12 lines of Maven `[INFO] ... SUCCESS` reactor summary (noise from `tail(res.text,12)`, sdd.mjs:1384).
Expected: hint only valid before implementation (or tell how: temporarily revert/stub the implementation); the gate also lists which IDs are weak (it gives only a count). Also the weak count is ✓ (not even a `!`) so it is easy to miss.
Workaround: ignored; I used mutation-Reds (temporarily breaking impl) only for edited tests.

## F7. (minor) `impact <unannotated file>` labels its own module's feature as "other features" with `!`
Repro: `node sdd.mjs --root . impact ledger-audit/src/main/java/ledger/audit/AuditEntry.java` (a record with no @implements; used only by AuditLog in the same feature).
Actual: `other features: audit (6), journal (12), period (9)` and `! other feature REQ-AUDIT-001 [audit]: ...` even though audit is the feature that owns that module/file; `impl:` echoes the file itself.
Expected: unannotated source files should be attributed to the feature of the REQs that reach them (or module), so `audit` is `same feature`, avoiding noisy `!` cross-feature warnings.
Suspect: impact classification in sdd.mjs uses annotations on the target file only to determine "same feature".
