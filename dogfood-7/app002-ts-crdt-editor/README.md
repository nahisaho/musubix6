# Collaborative CRDT editor core

Five TypeScript npm workspaces implement an RGA text sequence, causal replicas,
intention-preserving undo/redo, stable cursors, and a reproducible network simulator.
There is no UI, server, persistence layer, or network dependency.

## Run

Node **24+** runs the erasable TypeScript sources directly. Dependencies are local
compiler/types packages; workspace packages are linked by npm.

```sh
cd dogfood-7/app002-ts-crdt-editor
npm ci --ignore-scripts
npm test
npm run typecheck
npm run spike
node ../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs --root . gate
```

The suite has 44 annotated tests for 40 requirements. It includes 80 fixed-seed
partition/reordering scenarios, duplicate delivery, exhaustive small-history
permutations, a 12,000-node chain, and regression checks for actor-name collisions,
safe-integer exhaustion, buffered delivery during grouped edits, and uniformly
lost histories. Deep materialization is iterative; rooted-parent caching avoids
quadratic validation on ordinary insert chains.

## API example

```ts
import { Editor } from '@crdt/history';
import { capture, resolve } from '@crdt/cursor';

const alice = new Editor('alice');
const bob = new Editor('bob');
alice.insert(0, 'hello 😀').forEach(op => bob.receive(op));
const caret = capture(bob.replica.sequence, 5, 'right');

alice.insert(5, '!');
bob.insert(5, '?');
const operations = [...alice.replica.log, ...bob.replica.log];
operations.toReversed().forEach(op => alice.receive(op));
operations.forEach(op => bob.receive(op));
console.log(alice.text() === bob.text()); // true
console.log(resolve(bob.replica.sequence, caret));

alice.undo().forEach(op => bob.receive(op)); // hides only Alice's "!"
alice.redo().forEach(op => bob.receive(op)); // restores original node identity
```

Workspace entry points:

| Package | API |
| --- | --- |
| `@crdt/sequence` | `Sequence`, `validateOperation`, `canonical`, `key`, `parseKey` |
| `@crdt/causal` | `Replica(actor)`: `insert(index, point)`, `delete(index)`, `hide(target)`, `show(target, tag)`, `receive(op)`, `text()`, `clock`, `log`, `pendingCount`, `rejected` |
| `@crdt/history` | `Editor(actor)`: grouped `insert(index, text)`, `delete(index, count)`, `undo()`, `redo()`, `receive(op)`, `undoDepth`, `redoDepth`, `replica` |
| `@crdt/cursor` | `capture(sequence, index, affinity?)`, `resolve(sequence, anchor)`, selection equivalents |
| `@crdt/simulation` | `Random`, `scenario(seed, steps, mode)`, `validateReport`, `permutations`, `deepSequence` |

Editor operations return fresh wire-operation arrays. Replication transmits only
these operations, never local undo stacks. Remote edits and empty local edits do
not clear redo. Grouped edits stage replica state and defer pending delivery
until the entire group is generated; failures preserve clocks, text and history.
`Replica.atomic` is a synchronous editor-internal staging helper, not an async
transaction API. Use `replica.sequence` for inspection/cursor capture, not direct
`apply`: only `Replica.receive` may mutate a replica's causal state.

## Wire and ordering contract

```ts
type Clock = Record<string, number>;
type Base = { id: { actor: string; seq: number }; time: number; deps: Clock };
type Operation = Base & (
  { kind: 'insert'; after: string; value: string } |
  { kind: 'hide' | 'show'; target: string; tag: string }
);
```

- Actors match `[A-Za-z0-9_-]+`; `__proto__`, `constructor`, `prototype` are
  reserved. Other Object-method names are legal and covered by regression tests.
- `seq` and Lamport `time` are positive safe integers; clocks hold nonnegative
  safe integers. Unknown fields and invalid variants reject.
- IDs are `actor:seq`, without leading zeros. `HEAD` is the sole insert root.
  Inserts hold exactly one Unicode code point; editor indexes count code points,
  **not UTF-16 code units or grapheme clusters**.
- Siblings sort descending by Lamport time, ASCII actor, then counter. Lamport
  time is separate from contiguous actor counters, so insertion before a remote
  higher-counter node remains correct.
- Hides use their operation ID as their tag. Shows remove only a specified hide
  tag, permanently; a concurrent hide from another actor still hides the node.
- Delivery requires contiguous own counters and satisfied dependency clocks.
  References need causal proof, ready targets must be inserts, show tags must
  refer to hides of the same target, and Lamport time must exceed dependencies.
- Structurally invalid/ready-invalid input throws atomically. Missing dependencies
  buffer. Buffered input that becomes ready but fails semantic validation moves
  to `rejected` without advancing its actor clock. Descendants of a rejected
  operation cannot become deliverable; callers should diagnose/disconnect the
  invalid stream rather than fabricate missing operations.

The raw `Sequence` supports arbitrary delivery, including child-before-parent,
hide-before-node and show-before-hide. It validates structure/cycles and payload
identity, but only `Replica` validates causal and target/tag provenance.
Snapshots, returned clocks, logs and received operations are isolated copies.
Anchors are frozen and transfer only after their referenced nodes have arrived.

## Scope and SDD evidence

Actor identities must have exclusive writers. Eventual convergence requires
eventual delivery of every valid operation. Tombstones, removed tags, logs,
buffers and local history are retained without garbage collection or size limits;
this is a correctness core, not a resource-limited production transport.

Specs, plan, hash locks, independent reviews and the Red→Green/refactor ledger
are in `.sdd/`. The configuration explicitly exercises workspace `projects` and
cross-package `dependsOn`. The runtime spike checks TypeScript, Unicode, tag
removal, causal fixed points and deterministic ordering.

Two tooling defects have reproducible fixtures in `../findings/app002.md`.
In particular, `gate --changed` currently does not normalize Git paths for an
app root below its Git top level: it can incorrectly skip workspace tests and
evidence. **Use the full `gate` as the authoritative result** until fixed.
The other workaround is to hand-write typed scaffolds when workspace entry
files are missing; the automatic stub command currently fails to create them.
