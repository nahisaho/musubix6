# app07-php-rbac findings (PHP 8.5 + PHPUnit 11, composer PSR-4 `Rbac\\` => src/)

## 1. `tdd stub` (PHP) creates bogus `src/Framework/TestCase.php` for `use PHPUnit\Framework\TestCase;` and reports "stubbed" even when nothing is missing
Repro (any PHPUnit test class in a composer project with `vendor/` installed; classes under test already exist):
```
S="node .github/skills/lean-sdd-tdd/scripts/sdd.mjs"
# tests/X.php: use PHPUnit\Framework\TestCase; final class XTest extends TestCase {...}
$S --root . tdd stub TEST-AUD-001
```
Actual: `stubbed (throwing, Red-safe): src/Framework/TestCase.php — now run: tdd red ...`; file contains `namespace PHPUnit\Framework; class TestCase {}` (every `tdd stub` run, every PHP test). With other missing classes the list is `src/Framework/TestCase.php, src/Roles/RoleHierarchy.php`.
Expected: vendor/third-party classes (PHPUnit\*, anything resolvable by `vendor/autoload.php`) are never stubbed; "nothing to stub" message when everything exists.
Suspected: sdd.mjs ~L1006-1025: built-in check uses `class_exists($n,false)` without loading autoload, `projSrc` excludes `vendor/`, and `\bTestCase\b` appears in `extends TestCase`, so L1019 guard passes; psr4 has no match for `PHPUnit\` so L1022 falls back to `src/` + ns minus first segment.
Workaround: delete src/Framework after each stub run.

## 2. `tdd stub` (PHP) generates exception classes not extending \Exception when only used in `catch`
Repro: test has `use Rbac\Conditions\ParseException;` and `try {...} catch (ParseException $e)` (no `expectException(ParseException::class)`):
`$S --root . tdd stub TEST-COND-006` => `src/Conditions/ParseException.php`: `class ParseException\n{\n}` (not an Exception).
Expected: class used in `catch (X $e)` (and `throw new X`) extends `\Exception`, like expectException path.
Suspected: sdd.mjs L1005 only seeds `exc` from `expectException(...::class)`.
Workaround: hand-write the exception class.

## 3. `tdd stub` (PHP) does not stub instance methods; Red then rejected as load error
Repro: test `$h = new RoleHierarchy(); $h->addRole('x');` -> stub writes `class RoleHierarchy {}` only (also `new Engine($h)` ctor args / `$d->effect` props not generated). `tdd red` => `RED REJECTED ... Call to undefined method ...::addRole()`.
Expected per stubs.md ("JS/TS/Python classes also get throwing methods for `new C().m(`"): PHP is not listed, so docs-consistent but the stubs.md claim "Red-safe" for PHP only holds for static calls. Only `Class::method(` yields (static) methods (L1002/L998).
Workaround: write throwing stub classes by hand.

## 4. Misleading REFUSED hint for `approval: auto` T2 specs
Repro: T2 spec with `approval: auto`, no lock: `$S --root . tdd red TEST-ROLES-001`
Actual: `REFUSED: T2 feature roles approval is missing. run: approve prepare roles` (prepare for an auto spec only prints how to record; human-oriented).
Expected: `run: approve record roles --by ai:<reviewer> --review "<summary>"` for auto specs (prepare only for `approval: human`).
Location: sdd.mjs L1332.
Workaround: `approve record ... --by ai:x --review ...`.

## Notes (not filed as defects)
- tdd red on a `try { f(); fail(); } catch (E)` test is flagged "[weak] Red comes from setup call" even though the call is the behaviour under test (heuristic; acceptable).
- Verified OK: stale evidence after spec edit/relock, `tdd refactor` wording-only flow, Red re-record after test preamble edit, impact cross-feature chains (Roles/Conditions -> Engine -> Audit), gate/--changed.
