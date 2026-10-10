# Reactive UI workspaces

Node 24+ executes the TypeScript sources directly. `npm install`, `npm test`,
`npm run typecheck`, and `npm run demo` run from this directory.

Five packages provide a synchronous signals/effects dependency graph, a keyed
priority scheduler, immutable VNodes and a pure diff planner, deterministic SSR,
and host-adapter rendering with keyed reconciliation. Runtime dependencies are
only the sibling packages; linkedom is a test-only DOM implementation.

```ts
import { signal } from './packages/signals/src/index.ts';
import { h } from './packages/vdom/src/index.ts';
import { mount, domHost } from './packages/runtime/src/index.ts';

const count = signal(0);
const app = mount(
  () => h('button', { onClick: () => count.set(count.get() + 1) }, count.get()),
  domHost(document.querySelector('#app')!)
);
// app.dispose() removes the root, subscriptions, listeners and pending work.
```

## Contracts and boundaries

- Effects run synchronously; writes batch transitively before effects observe
  computed values. Computeds are lazy, cache reads, and retry after failures.
  Cleanups execute untracked. Async effect bodies are not supported.
- Scheduler priorities are `immediate`, `normal`, `idle`; equal priorities are
  FIFO. Keys replace pending tasks. Cancellation owns one enqueue generation.
  `flush(n)` processes at most n tasks; manual errors are aggregated after
  draining. Automatic microtask errors go to `onError`, or `scheduler.errors`.
- `h(tag, props, ...children)` snapshots props/styles, flattens children,
  normalizes strings/numbers, and ignores null/undefined/booleans.
  Keys are strings or numbers other than NaN, unique among siblings. Unkeyed
  nodes match their original positions, not adjacent keyed nodes.
- Diff patches are a declarative plan, **not** sequential array splices:
  paths/from indexes address the original tree; to indexes address the final
  sibling list. The runtime uses the exported matching table directly.
- SSR sorts attributes/styles, escapes text/attributes, omits events/keys,
  rejects invalid names, executable javascript/vbscript URL schemes,
  children of void tags, and unsupported script/style raw-text elements.
  URL policy is intentionally narrow, not a sanitizer for arbitrary untrusted
  CSS, HTML or all browser URL contexts. Components render untracked.
- Mounts evaluate reactive views synchronously, coalesce commits on a shared
  scheduler, and preserve keyed host identities. Evaluation and complete-tree
  preflight failures preserve the committed tree and can retry. Custom host
  operations **must not throw** and each mount exclusively owns its container;
  foreign-host exceptions cannot be rolled back. Hydration is not implemented.

## Dogfood evidence

`.sdd/plan.md`, locked specs, independent reviews, per-test hash-chained TDD
evidence, spikes and gate logs exercise the lean SDD/TDD script without changing
it. Explicit `projects` entries exercise same-stack workspace check ownership.
The characterization preflight regression is marked `(test-only)`.
Bug regressions cover failed computed recovery, self-disposal, URL coercion,
NaN keys and raw-text handling. A post-Green contract clarification is
re-locked and reverified. Use the full gate for nested-root validation; the
changed-only gate has a reproducible Git-path scoping defect documented in
`../findings/app006.md`.
