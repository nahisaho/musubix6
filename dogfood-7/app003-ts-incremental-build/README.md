# Incremental build system

TypeScript npm workspaces, Node 24 native TypeScript, `node:test`. No runtime dependencies.

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run demo
```

## Packages

- `@build/graph`: dependency-first lexical DAG order, ancestor/reverse closure, cycle witnesses, transactional edge replacement.
- `@build/cache`: canonical JSON SHA-256, ID/version/dependency-ID/hash cache keys, bounded LRU, copied artifacts and metadata, staged publication.
- `@build/executor`: bounded DAG concurrency, isolated failure, terminal-state events, cooperative cancellation, deterministic fake clock.
- `@build/engine`: exclusive incremental sessions, action versioning, content-based early cutoff and optional metadata hooks.
- `@build/dynamic`: synchronous `read(taskId)` discovery, widening/retry, exact read-set replacement and whole-session graph/cache transactions.

Task edges point **from consumers to prerequisites**. Supply explicit versions for external inputs.
Actions must be deterministic and dynamic actions retry-safe. Cache failures are never published.
An unchanged output hash cuts off downstream actions even when a prerequisite executes again.
Dynamic edges remain known on cache hits; revisiting an earlier version restores that artifact's exact read set.
Static edges cannot be removed by discovery.

`Engine.build(targets, signal?)` returns target artifacts, actual action IDs, cache-hit IDs and state events.
`update(id, version)` invalidates by key without clearing the shared cache. Overlapping builds/updates reject.
Cancellation propagates to running actions, which must cooperate; queued actions do not start.
Dynamic sessions stage artifacts in a fork and publish into the original supplied cache only after stabilization.
`maxRounds` defaults to 32; unknown tasks, cycles, failures and non-stabilization leave committed discoveries unchanged.
Dynamic `executed` includes attempted actions across discovery rounds; `reused` and events describe the final round.

`FakeClock.sleep(ms, signal?)` uses no real timers. `await advance(ms)` drains microtasks through a check-phase
barrier before each deadline, preserving FIFO ties and arbitrary finite resolved-promise chains.
Overlapping advances reject. Actions must not create infinite microtask chains or rely on wall-time timers.
Supported artifacts are finite JSON primitives, dense arrays and plain string-keyed objects; cyclic,
non-finite and unsupported values reject. Sparse arrays cannot collide with empty arrays.

## Dogfood evidence

Five T2 features; requirements and design in `.sdd/specs`, dependency plan in `.sdd/plan.md`.
The hash-chained ledger records assertion Reds, Greens, a transition-table characterization,
regression fixes and refactoring. `spikes/runtime.ts` records runtime assumptions.
Independent review results are in `.sdd/review.md`; findings about the skill itself are in
`../findings/app003.md`.

```sh
node ../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs --root . gate
node ../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs --root . impact REQ-CACHE-007
```

Always use the **full gate**: the current SDD script incorrectly scopes `gate --changed`
when `--root` is nested inside a larger Git repository (reproduction provided in findings).
