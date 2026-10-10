# app01 (js-eventstore) findings

Script: `.github/skills/lean-sdd-tdd/scripts/sdd.mjs` (2076 lines). `S="node …/sdd.mjs"`.

## F1. `tdd red` refusal hint says `approve prepare` for `approval: auto` specs
Repro: T2 spec with `approval: auto` (or none), tests written, then `$S --root . tdd red TEST-STORE-001` before any lock.
Actual: `REFUSED: T2 feature store approval is missing. run: approve prepare store`
Expected: for auto specs the next step is `approve record <f> --by ai:<reviewer> --review "<summary>"` (SKILL.md §2/§1); `approve prepare` is only for `approval: human`.
Location: sdd.mjs:1332 (hint hard-coded to `approve prepare`).
Workaround: ran `approve record … --by ai:… --review …` directly (worked).

## F2. `tdd stub` appends bogus methods to EXISTING real classes when a receiver variable's type is unknown
Repro (scratch project with package.json type=module, `$S init`, a T1 spec REQ-A-001/TEST-A-001):
```
src/real.js : export class Store { read() { return []; } }  export class Other { go() { return 1; } }
test/a.test.js:
  import { Store, Other } from '../src/real.js'; import { Handler } from '../src/handler.js';
  const make = () => new Store();
  /** @id TEST-A-001 @verifies REQ-A-001 */ test('TEST-A-001 x', () => { const store = make(); const h = new Handler({ store });
    assert.equal(h.run(), 1); assert.equal(store.read('x').length, 0); assert.equal(new Other().go(), 1); });
$S --root . tdd stub TEST-A-001 ; cat src/real.js
```
Actual: real.js is modified — `Other` gets `read(..._args){ throw new Error('not implemented: Other.read') }` (even though `store` is a Store which already has read). Stubs.md says "real code is never touched".
In my app the same thing injected `read/readAll/findByCommandId` throwing methods into my real, passing `SnapshotStore` and `IllegalTransitionError` classes (found only by chance via grep; it also changes @implements files, so hashes/evidence silently drift).
Expected: do not add methods to existing classes unless the receiver's class is resolvable (`new X()` direct), or never guess when type unknown.
Location: JS/TS class-method stubbing in the `tdd stub` code (search "not implemented:" in sdd.mjs).
Workaround: removed injected methods by hand after stubbing.

## F3. No way to correct a wrong test expectation after Red without `--characterization` (misuse) or sabotaging impl
Repro: write test with typo'd expectation (`assert.equal(illegal, 14)`; actual 15), Red (stub), implement, `tdd green T` → `GREEN REJECTED: test failed` (correct). Fix test (14→15), then:
`tdd green T` → `REFUSED: test file changed since Red … record a new Red`
`tdd red T`  → `RED REJECTED: test passed; Red needs a real failure (… --characterization …)`
Expected: a documented path for fixing a mistaken test (e.g. `tdd red --retest "reason"`, which records a weak Red with reason, or green accepting a test fix when the failing Green run is on record). Currently one must either temporarily break the implementation or abuse `--characterization` (documented for data-only tests), which then inflates the gate's "characterization" count.
Workaround: `tdd red T --characterization "fix miscounted expectation"`.

## F4. (HIGH, false positive) `tdd green` / `tdd red --characterization` accept a run where NO test matched the ID (Node ≥ 22: file-level pass)
Repro (T1 spec REQ-A-001/TEST-A-001; default node testCmd):
```
src/m.js : export const add = (a,b)=>a+b;
test/a.test.js:
  /** @id TEST-A-001 @verifies REQ-A-001 */
  test('adds numbers (no id in title)', () => { assert.equal(add(1, 2), 4); });   // really FAILS
$S --root . tdd red TEST-A-001                       # RED REJECTED: "test passed; Red needs a real failure"  (misleading; nothing ran)
$S --root . tdd red TEST-A-001 --characterization x  # RED ok [weak]
$S --root . tdd green TEST-A-001                     # GREEN ok   <-- test is actually failing
$S --root . gate   # tdd evidence ok for TEST-A-001, but `cmd test` (npm test) fails
```
Actual: with `--test-name-pattern TEST-A-001` matching nothing, Node 24 (v24.21.0) prints `✔ test/a.test.js … tests 1 pass 1 fail 0` (the file itself is reported as one passing test), so ZERO_TESTS (`# tests 0`, "no tests ran"…) never fires; Green/characterization Red is recorded for a test that never ran. SKILL claims "a green/refactor run where every test was skipped is rejected".
Expected: REJECTED "no test matched the ID (title must contain TEST-A-001)". Detect e.g. TAP/spec output where the only passing entry is the file name, or verify the run output contains a test line with the ID (or use `--test-reporter=tap` and require a `ok N - …ID…` subtest).
Location: sdd.mjs:543 (ZERO_TESTS), 1366-1379 (`zero` logic), 1372/1379 verdicts.
Workaround: ensure titles contain the ID (done in the app).

## F5. (MED, policy bypass) `approve record --by $'ai\u200b'` accepted as a human on `approval: human` specs
Repro: spec `tier: T2`, `approval: human`, with `## Design`.
```
$S --root . approve prepare a
$S --root . approve record a --by $'ai\u200b'   # -> "locked a by ai​: .sdd/specs/a.md" rc=0
$S --root . approve record a --by ai            # -> REFUSED (rc=2);  --by bot -> REFUSED;  --by 'ＡＩ:bob' -> REFUSED
```
Expected: zero-width / format characters (U+200B-200F, U+2060, U+FEFF) stripped before the generic-name check (and before `ai:` prefix detection); `ai\u200b` refused like `ai`.
Location: sdd.mjs:602, 623 (only `normalize('NFKC').trim()`), generic-name regex at 640.
Workaround: none needed (just don't).

## F6. (LOW) Missing/garbage CLI args give misleading messages
`$S --root . tdd green` (no ID) → `undefined not found as "@id TEST-..." annotation in source` (should be a usage error). Also `tdd red <ID> --characterization` without text falls into the "test passed; Red needs a real failure" path rather than saying the reason is required (not verified in isolation).
Location: tdd subcommand arg handling near sdd.mjs:1332-1355.

## F7. (LOW) `tdd stub` for `import * as ns` creates `export {}` → Red is `TypeError: util.slug is not a function`, accepted as a "real" Red
Repro: test imports `* as util from '../src/util.js'` and asserts `util.slug('A b')`; `tdd stub TEST-A-002` writes `src/util.js` = `export {};`; `tdd red` → `RED ok … fails with: TypeError: util.slug is not a function` (not a throwing "not implemented" stub, not weak, no warning). Same for static methods: `Foo.create(1)` is not stubbed (`class Foo` gets only instance method `list`). Also non-callable imports used as values (`CONFIG.max`, `initialState`, `TRANSITIONS`) are stubbed as throwing *functions* (`export function CONFIG()`), so property access yields undefined rather than a deliberate failure.
Expected: stub `ns.member(` calls as exported throwing functions; static `Class.m(` as `static m()`; or treat TypeError "is not a function" Red as weak.
Location: JS stub generator (search `export {}` / "not implemented:" in sdd.mjs).
Workaround: hand-wrote implementations / accepted the Red.
