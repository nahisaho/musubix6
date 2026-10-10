# app10 (ts monorepo) findings

## 1. `tdd stub` ignores multi-line (prettier-style) named imports, and prints a false "no missing relative imports"
Repro (any TS vitest project): test file
```ts
import {
  alpha,
  beta,
} from '../src/multi';
/** @id TEST-X-001 @verifies REQ-X-001 */ it('TEST-X-001 x', () => { expect(alpha(1)).toBe(1); });
```
`$S tdd stub TEST-X-001` → actual: `no missing relative imports in <test>`; nothing created; `tdd red` then says "load/compile error … run `tdd stub <ID>`" (a loop). Expected: stub `src/multi.ts` with alpha/beta.
Suspected: sdd.mjs:1148 static-import regex `import\s+([^'"\n;]*?)\s+from` excludes `\n` in the clause, so multi-line imports never match (message at 1320 then misleads).
Workaround: hand-write the stub, or put the import on one line.

## 2. `tdd stub` for `import * as ns from '../src/p'` creates empty `export {}` (no `ns.fn` stubs)
Repro: test `import * as ns from '../src/p3'; ... ns.thing('a',2)`; `tdd stub` → p3.ts contains only `export {};`; `tsc` then fails (`Property 'thing' does not exist`); Red would be a TypeError, not a throwing-stub Red. Expected: `export function thing(..._args:any[]):any {throw …}` from `ns.<name>(` usages.
Suspected: sdd.mjs:1128 and 1160-1163 `replace(/^\*\s+as\s+\w+$/, '')` drops the namespace import then `add(target, body || 'export {};\n')`.
Same section: inline `import { type Foo, bar }` — `Foo` is not emitted, typecheck fails on the stub (minor).
Workaround: write stub by hand.

## 3. `tdd stub` silently does nothing for workspace-package imports (`@bk/domain`); message says "relative imports"
Repro: test `import { isTerminal } from '@bk/domain'` (npm-workspaces package, new export). `$S tdd stub TEST-DOMAIN-009` → `no missing relative imports in …`. `tdd red` then records Red with `TypeError: isTerminal is not a function` (accepted, not a real stub Red, and typecheck breaks). Expected: resolve workspace packages (the gate/impact already do, per config.md "Workspace package names … are followed") and stub missing exports in the package entry, or at least say that package imports are not stubbed.
Suspected: sdd.mjs:1148 only matches `\.{1,2}/` specifiers; message at 1320.
Workaround: add export manually / accept the TypeError Red.

## 4. Stale-approval refusal tells the agent to run `approve prepare`, which is only for human specs
Repro: edit wording of a REQ in a locked T2 `approval: auto` spec, then `$S tdd refactor TEST-VALIDATE-002` → `REFUSED: T2 feature validate approval is stale. run: approve prepare validate`. For auto specs the correct step is `approve record <f> --by ai:<r> --review …` (SKILL.md); `approve prepare` is not needed (it just prints hashes).
Suspected: sdd.mjs:1332 message hard-codes `approve prepare`.
Workaround: ran `approve record` directly; worked.

## 5. (minor) `impact <test-file>` labels the test itself as `impl:`
Repro: `$S impact packages/api/test/booking.test.ts` → `impl: packages/api/test/booking.test.ts`, `reaches 0 file(s)`. Expected: no `impl:` line (or "test:"). Also `impact packages/domain/src/index.ts` (barrel without @implements) prints `impl: …/index.ts`.
Location: not pinpointed (impact printing section).
