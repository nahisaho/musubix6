# app21-php-saga findings (PHP 8.5 + PHPUnit 11; 6 features, 62 REQs, full gate exit 0)
Scratch repros kept in findings/repro-app21-a (skip/green) and repro-app21-b (stub, weak) — they need `ln -s <any app's vendor> vendor` (or `composer install`).

## 1. `tdd red` flags a false "weak Red: setup call" for inline `(new Cls(..))->method()` that is assigned and asserted
Repro (repro-app21-b; src/Rep.php `t()` throws `LogicException('not implemented: Rep->t')`):
```php
/** @id TEST-C-003 @verifies REQ-C-003 */
public function test_c_003_inline(): void { $t = (new Rep())->t(); $this->assertSame(1, $t); }
/** @id TEST-C-004 @verifies REQ-C-004 */
public function test_c_004_var(): void { $r = new Rep(); $t = $r->t(); $this->assertSame(1, $t); }
```
`S=... ; $S --root . tdd red TEST-C-003` → `[weak] ⚠ Red comes from setup call "Rep"`; TEST-C-004 (identical semantics) → plain RED ok.
Expected: both non-weak (`t()` is the act, `$t` is asserted). Also hits `$x = (new SagaReport($i))->summary(); assertSame([...], $x)` and `try { (new RetryExecutor($c))->run(...); $this->fail(); } catch`. Gate then lists the test among "weak Red".
Suspected: `setupOrigin` (sdd.mjs ~1724-1790; `assertedResult`/`isBareAct` var extraction does not see `(new X())->m()` as the call; the symbol reported is the class `Rep`).
Workaround: assign the object to a variable first (`$r = new Rep(); $r->t()`), or `--expect`.

## 2. `tdd refactor` repeats "test body changed since the last Green" warning although the test is unchanged since the previous refactor
Repro: edit a shared helper/import in a test file after Green; `tdd refactor TEST-X` (warns, recorded). Run `tdd refactor TEST-X` again with no further edits → the warning is printed again (git diff of tests is clean).
Expected: baseline = latest Green *or Refactor* entry; no warning when nothing changed since the last refactor. Actual: compares only to last `green` (sdd.mjs:1991-1992 `lastGreen = prior.filter(type==='green')`), so every later refactor of a re-baselined test (e.g. after production-only refactors) carries a misleading warning telling the agent to use red/green.
Workaround: ignore the warning.

## 3. PHP `tdd stub` ignores `use`d classes referenced only via class constants / enum cases (`Cls::CONST`, `Enum::CASE->value`); says "nothing to stub" and Red is rejected
Repro (repro-app21-b): no src/; test has `use Acme\Color; use Acme\Cfg;` and `Color::RED->value`, `Cfg::LIMIT`.
`$S --root . tdd stub TEST-C-001` → `nothing to stub for TEST-C-001 ...`; src/ not created; `tdd red TEST-C-001` → REJECTED `Class "Acme\Color" not found`, and its hint says "run `tdd stub` once" (circular).
Expected (references/stubs.md: "PHP `use Ns\Cls;` creates PSR-4 files"): create `src/Color.php` (or at least tell which `use` is unresolved). Also, when a `Cls::method()` is stubbed for an enum-like class (`SagaStatus::canTransition(..)` + `SagaStatus::PENDING`), the stub is a `class` with static methods, so `SagaStatus::PENDING` cases are missing (my enums/Value classes had to be hand-written). Same "nothing to stub" for methods called on non-`new` receivers (`$this->policy()->delayFor()`, helper returns).
Suspected: sdd.mjs ~1267-1315 (PHP stub builder derives classes from `Class::method(`/`new Class` only; `use` resolution only for those names).
Workaround: write the enum/class skeleton by hand.

## 4. PHPUnit Red summary is empty for tests whose failure comes from `$this->fail('<custom message>')`
Repro: `public function test_x(): void { foreach (['', 'a b'] as $bad) { try { new Step($bad); $this->fail('step name accepted: ' . json_encode($bad)); } catch (InvalidArgumentException) {} } }`; Red with a ctor that accepts anything → `RED ok TEST-DEF-002 (REQ-DEF-002) 75ms` with no `— fails with:` text (while `fail('expected failure for ...')` shows a reason because it contains "expected").
Expected: the first line under `There was 1 failure:` ("1) Class::test\n<message>") is shown. Suspected: reason extraction regex list at sdd.mjs:1977 has no PHPUnit "There was N failure" / message-line rule (only keyword matches such as `Failed asserting`/`expected`).
Workaround: none needed; read phpunit output manually. Low severity (cosmetic, but removes the only evidence that the Red is a real assertion).

## 5. `tdd green` (and `tdd red --characterization`) accept a PHPUnit run where the test was SKIPPED / ran no assertions
Repro (repro-app21-a, tests/Sk3Test.php): test body `if (getenv('SK_SKIP')) { $this->markTestSkipped('env'); } $this->assertSame('b','a');`
`$S --root . tdd red TEST-SK-003` → RED ok (fails with assertion); `SK_SKIP=1 $S --root . tdd green TEST-SK-003` → `GREEN ok` although phpunit printed `OK, but some tests were skipped! Tests: 1, Assertions: 0, Skipped: 1`. Likewise `tdd red --characterization x TEST-SK-001` on a body that only calls `markTestSkipped()` records Red+Green and `gate` counts it as verified (REQ-SK-001 verified by a skipped test).
Expected: Green requires the selected test to have executed (PHPUnit exit 0 is not enough: parse `Skipped:`/`Incomplete:`/`Risky` /`No tests executed`/"did not perform any assertions") — otherwise REFUSED or at least INCOMPLETE; same for pytest `skipped`, etc. Suspected: green accepts `res.exit===0` only (sdd.mjs ~1960-1990).
Workaround: none; reviewer discipline.

## Notes (not defects)
- `gate --changed` in a repo with no commits treats everything as changed; run an initial `git commit` first.
- Changing a test-file helper/import invalidates evidence for every test in the file (by design, #118); `tdd refactor` per test restores it.
