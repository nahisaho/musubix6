# TypeScript federation gateway

A zero-runtime-dependency, in-process GraphQL federation gateway. Six npm workspace
packages provide a shared lexer/AST, SDL composition, query planning, request-local
batching, dependent entity execution and the public gateway.

```sh
npm install
npm test
npm run typecheck
npm run demo
```

Requires Node 24+ (native TypeScript type stripping). TypeScript is checked in
strict mode without emitting build files.

## Public API

```ts
import { Gateway } from './packages/gateway/src/index.ts';
const gateway = new Gateway([
  { name: 'products', sdl: 'type Query { ping: String }', service: {
    root: async () => 'pong',
    entities: async () => []
  }}
]);
await gateway.execute('{ ping }'); // { data: { ping: 'pong' }, errors: [] }
gateway.health();                 // version, subgraphs, cachedPlans, planBuilds
```

`root(field, args, selections)` returns a scalar, object, list or null.
`entities(type, representations, selections)` returns one positional object,
null or Error per representation; batch cardinality mismatches are failures.
Adapters **must honor selection aliases**, including injected hidden aliases.
The runnable demo's adapters show recursive projection and entity resolution.

Composition understands object/scalar SDL, extensions, `@key`, `@external`,
`@shareable` and `@requires`, including nested fieldsets. It rejects ownership,
type and requires-cycle conflicts. Planning supports one query, aliases, literal
and variable arguments, variable defaults, named and inline object fragments.
Keys and prerequisites are injected with collision-free aliases. Cross-service
dependencies run in stages; nested prerequisite entities complete before their
consumer. Request-local microtask batching deduplicates canonical structured keys.

Gateway updates compose before swapping schema/services; requests snapshot the
current version. Query plans use a bounded LRU cache with variable snapshots.
Root and entity failures produce partial data with response paths; missing keys
never reach entity adapters. Hidden fields do not leak into the response.

This is deliberately not a complete GraphQL implementation: no mutations,
subscriptions, interfaces/unions, input-schema coercion, argument schema
validation, executable directives, introspection or nonnull error bubbling.
Subgraph adapters are trusted local functions, not an HTTP transport.

## SDD/TDD dogfood

Five T2 specs contain 45 requirements. The ledger records initial Red→Green
cycles, six bug-fix regression tests, a type-only refactor, stale-spec rejection
and re-locking, impact analysis, merge-ledger and changed/full gates.
Three intentionally retained setup-origin Reds are reported as weak, not hidden.
`.sdd/review.md` records independent spec and risk reviews.

Run SDD with cwd and root equal to this app:

```sh
S=/home/nahisaho/GitHub/musubix6/.github/skills/lean-sdd-tdd/scripts/sdd.mjs
node "$S" --root "$PWD" gate
```
