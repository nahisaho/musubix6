
# app22 (PHP GraphQL-lite) findings

## A. PHP `tdd stub` / `tdd red --missing-module` match project classes by SHORT name, ignoring namespace
Repro (any PHP project):
1. `src/Sdl/Parser.php` declares `namespace App\Sdl; class Parser {...}`.
2. A test does `use App\Query\Parser; ... Parser::parse('x');` (class `App\Query\Parser` does not exist yet).
3. `$S --root . tdd stub TEST-X-001` -> "nothing to stub".
4. `$S --root . tdd red TEST-X-001 --missing-module` -> REFUSED (treated as load/compile error for `Class "App\Query\Parser" not found`).
Expected: stub generated at src/Query/Parser.php; missing-module Red accepted (the FQCN is missing).
Actual: skipped because some other file declares a class with the same short name.
Suspected: sdd.mjs ~line 1278 (PHP stub generation project-class skip) and ~line 654 (`declaredMissingModule`).
Workaround: hand-write the stub class (throwing `not implemented`) and use `tdd red --expect "not implemented"`.
Seen in app22 with Query\Parser vs Sdl\Parser and Query\Validator vs Schema\Validator.
