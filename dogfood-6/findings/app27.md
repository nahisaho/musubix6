# app27 (ts-ot-editor) findings

## 1. `tdd stub` appends throwing stubs to a barrel `index.ts` for names it already re-exports via `export * from`
Repro: npm workspaces; `packages/core/src/index.ts` = `export * from './ops';` where ops.ts really exports `apply` and type `Op`. Test in another package: `import { apply, type Op } from '@ot/core'; import { Server } from '../src/server';` (server.ts missing). Run `$S tdd stub TEST-SERVER-001`.
Actual: output `stubbed ...: packages/core/src/index.ts, packages/server/src/server.ts`; index.ts now ends with `export function apply(..._args:any[]):any { throw new Error('not implemented: apply'); }` and `export type Op = any;`. The local declaration shadows the star re-export, so the REAL `apply` is replaced by a throwing stub for every consumer (and `Op` becomes `any`): silently breaks working code.
Expected: names resolvable through `export *` chains are not stubbed.
Suspected: workspace-package stub path (entry-file append) only checks names declared in the entry file itself, not re-exports (search `not stubbed` / workspace branch of `tdd stub` in sdd.mjs).
Workaround: restore the barrel by hand after every stub (`git diff`).
Also seen for `OpError` (class) and `Server` (class) with `export * from './server'` barrels: stubs appended to index.ts shadow the real classes.

## 2. `tdd stub` invents methods on a class from unrelated `.push(` / `.map(` calls near `new C(`
Repro (dogfood-6/findings/repro-app27/r2): test `import { Box } from '../src/box'; function mk() { const out: number[] = []; return { b: new Box((n: number) => out.push(n)), out }; }` and body `const { b, out } = mk(); b.go(); expect(out.map((x) => x + 1)).toEqual([2]);` then `$S tdd stub TEST-R-001`.
Actual: src/box.ts gets `go` (correct) plus `push` and `map` methods (`throw new Error('not implemented: Box.push')`); these are Array calls on `out`, not Box. Same in app27 for `Client` (`up[i].push`, `sent.map`).
Expected: only methods called on Box receivers (`b.go`) are stubbed.
Suspected: receiver heuristic for `new C(..)` / `v = C(); v.m(` accepts every `.m(` call in the enclosing helper/test body.
Workaround: delete extra stubs by hand.

## 3. Weak-Red false positive: failure from the asserted method is blamed on the "setup call" when the object comes from a factory helper
Repro (dogfood-6/findings/repro-app27/r3, vitest; src/box.ts has `go(): void { throw new Error('not implemented: Box.go'); }`):
test: `function mk(): { b: Box } { return { b: new Box() }; }` ... `/** @id TEST-R-001 @verifies REQ-R-001 */ it('TEST-R-001 x', () => { const { b } = mk(); b.go(); expect(b.n).toBe(1); });`
`sdd.mjs tdd red TEST-R-001` -> `RED ok ... fails with: not implemented: Box.go [weak] Red comes from setup call "Box", not the asserted behaviour`.
Expected: not weak. The throwing call is `b.go()` (the act, a bare call statement right before the assertion); `Box` is only constructed inside the helper. With `const b = new Box();` inline the same test is NOT weak (verified), so only the helper indirection flips the verdict.
Impact in app27: 9 of 12 TEST-CLIENT-* Reds were flagged weak although each calls `c.local(..)` / `c.ack()` / `c.serverOp(..)` directly (a `mk()` helper builds the Client).
Suspected: weak-Red heuristic (sdd.mjs, search `setup call`) maps the class name in `Box.go` to the constructor call inside helper `mk`.
Workaround: construct inline, or accept the warning.

## 4. Appending a test in a NEW `describe` block stales the previous last test (docs say appended tests don't)
Repro (dogfood-6/findings/repro-app27/r3): file with `describe('box', () => { /** @id TEST-R-001 @verifies REQ-R-001 */ it('TEST-R-001 x', () => { const b = new Box(); b.go(); expect(b.n).toBe(1); }); });` -> `tdd red` + `tdd green` OK. Append at EOF: `describe('more', () => { /** @id TEST-R-002 @verifies REQ-R-001 */ it('TEST-R-002 y', () => { ... }); });` then `sdd.mjs gate --no-run`.
Actual: `TEST-R-001: test changed since last Green/Refactor` (0/2 Red->Green). In app27 the same hit TEST-SERVER-012 when a bug-fix test TEST-SERVER-013 was appended in its own `describe('server bug fixes')`.
Expected (enforced-rules.md "the last test's hash region ends at its closing line, so appended tests/`main()` don't stale it"): TEST-R-001 stays valid. The region of the last test apparently runs to the next `@id`, so it swallows the outer `});` + blank + `describe(` lines that the next test legitimately adds/changes.
Suspected: test-region hashing (sdd.mjs, search the function that slices the region between `@id` markers / "closing line"): the end-of-region detection only handles the final test of the file, not a test followed by another @id after a closing of the enclosing block.
Workaround: add new tests inside the existing describe block (before its closing `});`), or run `tdd refactor <ID>` on the staled test (worked).

## 5. `review check` / `approve record --review` accept findings whose status is not Open/Closed (Pending, Reopened, Unresolved...) -> unresolved critical finding locks the spec
Repro (app27 ops spec): review file
```
spec: sha256:<12+ hex of current spec>
verdict: pass
open: 0

## Findings
| ID | Severity | Where | Status |
|----|----------|-------|--------|
| R-1 | critical | ops.md:5 | Pending |
| R-2 | major | ops.md:6 | Reopened |
```
`sdd.mjs review check r.md --feature ops` -> `REVIEW OK`; `sdd.mjs approve record ops --by ai:rubber-duck --review r.md` -> `locked ops ...`; gate then shows the lock as ok [ai, review file]. Also OK: a status of `Not Closed`, `Closed (still open?)`, and bullet findings without any status (`- R-1 major x:1 (unresolved)`). Only the exact word Open (any case) is counted.
Expected (enforced-rules.md: "findings carry an explicit status ... `open:` must equal the Open lines found"; template: "Status Open or Closed"): a finding row whose status is neither Open nor Closed (or missing) is rejected as `INVALID: finding R-1 has no explicit Open/Closed status`.
Suspected: review-file parser (sdd.mjs, search `Open finding` / `does not match`) only counts positive Open matches instead of validating every finding row.
Workaround: reviewer discipline; keep status cells strictly Open/Closed.

## 6. `tdd stub` ignores generic instantiation `new C<T>(..)`: instance methods are not stubbed
Repro (dogfood-6/findings/repro-app27/r4): `import Foo from '../src/foo';` ... `const f = new Foo<string>(o); expect(await f.run(Mode.Fast)).toBe(3);` then `sdd.mjs tdd stub TEST-R-001`.
Actual: src/foo.ts has `export default class Foo { constructor(..._args: any[]) {} }` only; `run` is missing (tsc: Property 'run' does not exist; Red would be a TypeError "f.run is not a function" instead of a throwing-stub Red). Identical test with `new Foo(o)` -> `run(..._args)` stubbed correctly. Stub output claims success (`stubbed (throwing; compile NOT verified)`).
Expected: `new Foo<string>(..)` is treated like `new Foo(..)`.
Suspected: receiver/instance regex for `new C(` (sdd.mjs, tdd stub JS/TS class-method section) does not allow `<...>` type arguments.
Workaround: add the method by hand (or drop the type argument in the test).

## 7. Unknown inputs are silently accepted / misreported (minor usability)
Repro: (a) `sdd.mjs gate --bogus` -> runs full gate, exit 0 (unknown flag ignored; a typo such as `--changd` silently runs the FULL gate instead of failing). (b) `sdd.mjs review check nofile.md --feature ops` -> prints `usage: review check <file> --feature <feature>` although both args were given (expected: `review file not found: nofile.md`). (c) `sdd.mjs review template nofeat` -> prints a template with the literal placeholder `spec: sha256:<spec sha256>` and exit 0 although feature `nofeat` does not exist (`approve prepare nofeat` correctly says `unknown feature "nofeat". known: ...`).
Expected: unknown flag -> usage + exit 2; missing file -> specific error; unknown feature -> same `unknown feature` error as approve.
Suspected: argument parsing/dispatch in sdd.mjs main (usage fallback at the `review` and `gate` branches).
Workaround: none needed; be careful with flag spelling.
(d) `sdd.mjs tdd refactor TEST-OPS-001 TEST-NOPE-9` records `REFACTOR ok TEST-OPS-001` in the ledger, then reports `TEST-NOPE-9 not found` and exits 2: the multi-ID command is not validated up front, so a typo leaves a partial ledger write. Expected: validate all IDs first, then run.
