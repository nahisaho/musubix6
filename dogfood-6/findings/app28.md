# app28 findings (js-semver-resolver) — sdd.mjs

Scaffold used by all repros (run in an empty dir, `S=node .../sdd.mjs`):
```sh
git init -q; printf '{"type":"module"}' > package.json; $S --root . init; mkdir -p .sdd/specs test src
```
Spec used: `.sdd/specs/s.md` = `feature: s / tier: T1` + table rows `REQ-S-001`.. (one per test below).
Ready-made repro dirs: `findings/repro-app28-a`, `findings/repro-app28-b`.

## F1 (high) Skipped node:test gets Red (characterization) + Green and gate PASSes
Repro: test file `test('TEST-S-001 x', { skip: 'later' }, () => {...})` (or `test.skip(...)`), impl present:
```sh
$S --root . tdd red TEST-S-001            # REJECTED "test passed; Red needs a real failure" (misleading: it was skipped)
$S --root . tdd red TEST-S-001 --characterization x   # RED ok [weak]
$S --root . tdd green TEST-S-001          # GREEN ok  <-- never executed
$S --root . gate                          # SDD GATE PASS, "1/1 tests Red→Green"
```
Actual: skipped test accepted as Green evidence; gate PASS. Expected: Green/Red rejected ("skipped"), per SKILL ("a green run where every test was skipped is rejected").
Cause: `NO_PASSED` (sdd.mjs:669) only matches TAP `# pass 0 … # skipped N`; Node ≥20 non-TTY spec reporter prints `ℹ pass 0 … ℹ skipped 1`, so `zero` (≈line 1961) is false. Also the `nodeNoMatch` check passes because the ID appears in the skip line.
Workaround: don't skip tests; use `deferred` on the REQ instead.

## F2 (med) Test-name pattern is unanchored: TEST-S-001 collides with TEST-S-0011 (false Red, false Green rejection)
Repro: spec REQ-S-001 + REQ-S-0011; tests `TEST-S-001` (asserts one()===1, passes) and `TEST-S-0011` (asserts one()===2, fails); `one=()=>1`.
```sh
$S --root . tdd red TEST-S-001     # RED ok — fails with AssertionError   (TEST-S-001 itself passes! failure is from TEST-S-0011)
$S --root . tdd green TEST-S-001   # GREEN REJECTED: test failed
```
Expected: the ID must match as a whole token (`TEST-S-001(?![0-9A-Za-z])`); trace accepts both IDs without complaint. Suspected: default `testCmd` `--test-name-pattern {id}` substitution (init, config detection) / the "sibling" attribution only exists for Julia (`juliaSiblingFail`, ~line 1960). Workaround: keep IDs prefix-free (fixed-width 3 digits, never a 4-digit sibling).

## F3 (med) `review check` / `approve --review <file>` treat non-"Open" unresolved statuses as resolved
Repro (header from `review template s`, `verdict: pass`, `open: 0`), single findings row with Status cell:
`| F1 | high | a.js:3 | Open (needs fix) |`, `| … | OPEN - blocked |`, `| … | Reopened |`, `| … | Pending |`, or a row with no Status cell → all `REVIEW OK`. Only exact cell `Open`, `**Open**`, `- [ ]`, `state: open` count.
Expected: SKILL/enforced-rules says "findings carry an explicit status"; anything not Closed/Resolved/Fixed (or missing) should be Open or invalid.
Cause: `isOpenLine` sdd.mjs:~690 requires the whole cell to equal `open`. Workaround: write only `Open`/`Closed` in Status.

## F4 (med) `tdd stub`: error classes are emitted as plain classes (not `extends Error`) → misleading Red
Repro: test `import {parse, ParseError} from '../src/p.js'; assert.throws(() => parse('x'), ParseError); assert.throws(()=>parse('y'), e => e instanceof ParseError)`; `$S --root . tdd stub TEST-S-001`
Stub gets `export class ParseError { constructor(..._args) {} }`. `tdd red` then reports `fails with: TypeError: Class constructor ParseError cannot be invoked without 'new'` (accepted Red, wrong reason) — in app28 (range.test.js, TEST-RNG-010 with one extra assertion) it was instead `REJECTED: load/compile error`. (Another test file got a Proxy for the same kind of name, so output is inconsistent: Proxy for `SemverError`/`LockError`, class for `RangeSyntaxError`.)
Expected: `export class ParseError extends Error`. Workaround: hand-edit stub to `extends Error`.

## F5 (low) `tdd stub` invents a bogus export from the import path text (`ns.js` → `export const js`)
Repro: test has `import * as ns from '../src/ns.js'; … ns.add(1,2)`; `$S --root . tdd stub TEST-S-001` → src/ns.js contains `export function add` **and** `export const js = new Proxy(...)`. The `ns.js` inside the import specifier is scanned as a member access of namespace `ns`. Expected: only `add`. Harmless but wrong; workaround delete the extra export.

## F6 (low/med) Weak-Red "setup call" false positive when the asserted variable is wrapped by a local helper / spread
Repro (repro-app28-b): `const obj = (r) => Object.fromEntries(r);` test body `const r = run(1); assert.deepEqual(obj(r), {a:1});` after `tdd stub` → `RED ok … [weak] ⚠ Red comes from setup call "run"`. The identical test asserting `assert.deepEqual(r, …)` is not flagged. Same for `assert.deepEqual([...a.tree],[...b.tree])`. Result is asserted, so it is the act under test.
Cause: `assertedResult` (sdd.mjs ~1750) only unwraps a fixed WRAP list (list/len/sorted/…/Object.*/Array.from), not user helpers, spread or array literals. Workaround: `tdd red <ID> --expect "not implemented: run"`.

## F7 (low) Top-level helper between two tests is hashed into the *previous* test's region
Repro: `test A` … `const expected = 2;` … `/** @id TEST-S-002 */ test B uses expected`. Edit `expected` → gate says `TEST-S-001: test changed since last Green/Refactor`; TEST-S-002 (the real user) stays "valid". Misleading attribution (documented as "own @id region + preamble"). Workaround: put shared helpers in the preamble before the first @id.

## F8 (low) spec table "Test" column is never validated
Repro: change a row's Test cell to a non-existent `TEST-S-099` → `trace` prints `TRACE OK … 0 errors, 0 warnings`. Template/docs present the column as part of the contract. Expected a warning for unknown / mismatching TEST ids vs `@verifies`.

## F9 (low) gate wording: `tdd red --retest` Red is counted as "characterization: passed without a failing Red"
Repro: `tdd red T --retest "test bug"` then green, `gate` → `1 weak Red (1 characterization: passed without a failing Red)` although nothing was characterization (sdd.mjs:388 `charac: !!(r.characterization || r.retest)`; text ~2284). Expected a separate "retest" label.
