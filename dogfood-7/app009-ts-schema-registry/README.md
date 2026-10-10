# TypeScript schema registry

Five npm workspaces implement an in-memory, Avro-like schema registry:

| Workspace | API |
| --- | --- |
| `@schema/model` | `validateSchema`, `validValue`, `canonical`, `fingerprint` |
| `@schema/compatibility` | `canRead(reader, writer)`, `checkCompatibility(next, history, mode)` |
| `@schema/registry` | `Registry.register`, `setMode`, `get`, `byId`, `history` |
| `@schema/codec` | `createCodec(schema).encode(datum)` / `.decode(bytes, writerSchema?)` |
| `@schema/migration` | `planMigration(writer, reader)`, `migrate(plan, datum)` |

## Run

Node 24+ is required for native erasable TypeScript support.

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run demo
node ../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs --root . gate
```

The demo registers three backward-transitive event versions, checks atomic
rejection and optimistic conflicts, decodes old records using the latest schema,
and verifies an equivalent auditable migration.

## Contract

- Types: null, boolean, int, long, float, double, string, bytes (`Buffer`),
  records, enums, arrays, maps and nonempty unions. Names are simple identifiers;
  recursive named references and logical types are out of scope. Maximum depth: 64.
- `int` is signed 32-bit; `long` is a safe JavaScript integer; floating values
  must be finite. This is not a full-range 64-bit integer implementation.
- Modes: `none`, `backward`, `forward`, `full`, and the three corresponding
  `-transitive` modes. Default: backward. Nontransitive checks compare the latest
  version; transitive checks include every version.
- Reader aliases are directional. Exact field names precede aliases; ambiguous
  aliases are incompatible. Added reader fields require valid defaults.
  Enum readers may supply a fallback symbol. Numeric promotions are directional.
- Canonical identity ignores schema `doc` metadata but retains defaults, aliases,
  field order and arbitrary default-data keys (including keys named `doc`).
  Identical schemas share global IDs; subject deduplication does not add versions.
- Registration is synchronous and atomic. `expectedVersion` checks precede
  deduplication. Inputs and returned schemas are copied; no persistence/deletion API.
- Generated closure-based codecs use a UTF-8 JSON envelope containing format,
  SHA256 fingerprint and schema-directed datum. Bytes use base64. Unions preserve
  the first datum-valid writer branch by an explicit index; readers choose the
  first compatible branch. Unknown envelope keys and tag/value disagreement fail.
- This is **not Apache Avro binary wire format**. Decoding an old writer requires
  its schema. Migration plans snapshot schemas, record deterministic operations
  and fingerprints, reject unsafe conversions and preserve input data.

## Dogfood evidence

`.sdd/plan.md` orders five T2 features; `.sdd/specs/` contains 45 requirements.
The hash-chained ledger records initial Red→Green cycles, four bug fixes,
parser extraction/refactor, and one explicitly characterized, test-only policy
table. Risk reviews are in `.sdd/review.md`. Runtime assumptions are exercised
by `spikes/runtime.ts`.

The nested-root `gate --changed` defect is documented in
`../findings/app009.md`; use the **full gate** for reliable evidence.
