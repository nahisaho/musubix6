# app18-java-maven-search findings (sdd.mjs)

Repro dir for stub findings F1-F3: `dogfood-6/findings/repro-app18-a` (JUnit5 test `RTest.java`, T1 spec `r`).

## F1. Java `tdd stub`: comma inside a string literal is counted as an argument separator (bogus overload)
Repro: `cd repro-app18-a && S="node .../sdd.mjs"; $S --root . tdd stub TEST-R-001` with test body `assertEquals(3, Tok.count("a, b"));`
Actual: `Tok.count(Object a0, Object a1)` (2 args). Expected: `count(Object a0)` (1 arg). In my real app `Tokenizer.tokenize("Hello, world!! ...")` produced a spurious `tokenize(Object,Object)` overload in addition to the 1-arg one.
Suspected: Java call-site arg splitter in sdd.mjs does not skip string/char literals. Workaround: hand-fix stub.

## F2. Java `tdd stub` refuses to extend a file it generated itself ("hold real code")
Repro: `$S --root . tdd stub TEST-R-001` then `$S --root . tdd stub TEST-R-002` (TEST-R-002 also calls `Tok.name()` on the already-stubbed class).
Actual: `! not stubbed: name in src/main/java/Tok.java — those modules hold real code, which stubs never edit`. The file only holds a throwing stub from the previous run.
Expected: generated Java stubs should be recognisable (C# has a `// sdd-stub` marker) and be extended; or message should not claim "real code". Consequence: for a multi-test class every sibling test in the same class needs hand stubs.
Workaround: add methods by hand.

## F3. Java `tdd stub`: return type ignored for `assertEquals("lit", Cls.m(..))` (int) and chained static factories
Repro: `assertEquals("y", Util.lower("Y"));` -> `public static int lower(Object a0)`. Also (real app) `assertEquals("caress", Stemmer.stem("caresses"))` -> `static int stem`, `Analyzer.standard().analyze(..)` -> `static int standard()` (chain `.analyze` ignored although stubs.md says chains get a `<F>Result` class), and `List<Token>` return types are emitted without importing `Token` (not the stub's fault alone, but the import is missing).
Expected: String for a String literal expectation (stubs.md: "return type from the compared literal"); `standard()` should return a class having `analyze`.
Workaround: hand-written stubs.

## F4. Weak-Red (setup-origin) false positive for JUnit `assertEquals(expected, actual)` when the SUT result is in a local variable
Repro (`repro-app18-a`, `src/test/java/R3Test.java`, stub `Calc.twice` throws `UnsupportedOperationException("not implemented: twice")`):
```java
Calc c = new Calc();
var r = c.twice(2);        // same for `int r = ...`
assertEquals(4, r);
```
`$S --root . tdd red TEST-R-005` -> `RED ok ... [weak] ⚠ Red comes from setup call "twice", not the asserted behaviour`.
Expected: the result is asserted (references/enforced-rules.md: "a helper whose result is asserted is not setup"; `const r = sut(..)` + assertions on r is the act), so non-weak. Same with `assertTrue(r > prev, ..)` in a loop (my RANK-002) and `List<Lexeme> ls = QueryLexer.lex(..); assertEquals(List.of(..), ls.stream()...)` (QUERY-001).
Suspected: `assertedResult()` in sdd.mjs ~L1749: `subject()` regex only accepts the variable as the FIRST argument (`assert\w*\(\s*WRAP r`), but JUnit/TestNG order is (expected, actual) so the result is the 2nd arg; also the declaration regex only knows `const|let|var`, not Java typed locals.
Workaround: `tdd red <ID> --expect <text>` / accept weak flag (gate then lists them as weak).

## F5. Weak-Red `--retest` evidence is reported by gate as "characterization: passed without a failing Red"
Repro: after a recorded Red, change the test expectation, `tdd red <ID> --retest "why"`, `tdd green <ID>`, `gate`.
Actual: `✓ tdd evidence: 19/19 tests Red→Green, 4 weak Red (4 characterization: passed without a failing Red)` — the 4 were `--retest` records (weakWhy `retest`), nothing is a characterization test.
Expected: separate counter (`4 retest`) or accurate wording. Suspected: sdd.mjs:388 `charac: !!(r.characterization || r.retest)` feeds the "characterization" counter at sdd.mjs:2284. Workaround: none needed (cosmetic/misleading).

## F6: Forked-JVM crash (OutOfMemoryError "Requested array size exceeds VM limit") during `tdd red` is reported as "no test matched the ID"
- Repro (app18-java-maven-search, Maven/surefire 3.2.5): test `void test_codec_011_for_count_cap() { assertThrows(CodecException.class, () -> ForCodec.unpack(b(0xFF,0xFF,0xFF,0xFF,0x07,0))); }` with an unpack that does `new int[(int) count]`; then `sdd tdd red TEST-CODEC-011`.
- Actual: `RED REJECTED TEST-CODEC-011: no test matched the ID, or the test is skipped/todo (check @id vs test title/method name...)`. mvn output shows `Tests run: 0` plus "There was an error in the forked process / Requested array size exceeds VM limit".
- Expected: a message pointing to the crashed fork (the test matched; the runner died), or accept it as a Red crash with the Error text.
- Suspected: the "no test matched" classification keys off `Tests run: 0` (zero-matched detection) without checking for fork/crash errors.
- Workaround: change the test so the failure is an assertion (smaller count).

## F7: `tdd refactor` warns "test body changed" for an unrelated test when a helper is added after it in the same test file
- Repro: after TEST-CODEC-010 is Green, insert `private static byte[] withWidth0(int n){...}` immediately before the `/** @id TEST-CODEC-011 */` comment (helper sits between the two tests), then `sdd tdd refactor TEST-CODEC-001 ... TEST-CODEC-011`.
- Actual: only TEST-CODEC-010 gets "⚠ test body changed since the last Green (includes the file preamble...)". Its assertions are untouched.
- Expected: no warning; helper belongs to neither test body (or belongs to the following test).
- Suspected: a test's body span extends to the next `@id` comment, so any helper placed between tests is attributed to the preceding test.
- Workaround: ignore the warning (or place helpers at the top of the class).
