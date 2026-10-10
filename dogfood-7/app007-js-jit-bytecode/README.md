# Bytecode VM laboratory

Zero-dependency JavaScript ESM application (Node >=20).

```sh
npm test
npm run check
npm run demo
```

Modules:
- `src/bytecode.js`: validated instruction tuples, definite assignment and bounded execution.
- `src/allocation.js`: CFG fixed-point liveness, graph coloring and reusable spills.
- `src/caches.js`: branded shape objects, interned shapes and mono/poly/megamorphic inline caches.
- `src/collection.js`: explicit roots, stable heap handles and iterative mark-compact collection.
- `src/tiering.js`: cold/baseline/optimized lifecycle, constant folding, entry guards and deoptimization.

Programs contain `{ registers, arity, code }`; input registers start at zero.
Instructions are `CONST`, `MOV`, `ADD`, `SUB`, `MUL`, `LT`, `JMP`, `JZ`,
`GET`, `SET` and `RETURN`. Jump targets are absolute instruction indices.
Constants are primitives; heap handles must be supplied as arguments or read
from object fields. Inline caches accept registry-created shape objects;
uncached VM access also supports ordinary JavaScript properties.

The engine snapshots programs and optimizes after invocation thresholds.
Entry guards run before effects; guard failure executes baseline semantics
without repeating writes. Sparse argument arrays normalize holes to `undefined`.
Instruction hooks receive the program counter and may collect the heap:
live register handles and argument handles remain temporarily rooted, including
physical/spill execution, and root leases release even when a hook throws.

The heap is a simulator, not host-memory collection. Only direct handle-valued
fields are graph edges; arrays and plain nested objects are scalar payloads.
Calls and instruction hooks are synchronous; this is bytecode optimization,
not native machine-code generation or a JavaScript parser.

Five T2 feature contracts, approvals, review resolutions and Red/Green evidence
are preserved under `.sdd/`. The resumed run completed BC-009 and OPT-009 bug
cycles, added the OPT-010 review regression, refreshed import-only evidence,
and ran the cross-feature `impact REQ-IC-001` query.
Run the **full** skill gate with `--root` pointing here: the finding in
`../findings/app007.md` explains why changed-only gates are insufficient when
the app is inside a parent Git repository.
