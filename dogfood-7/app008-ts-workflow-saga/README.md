# Durable workflow saga (app008)

Five TypeScript npm workspace packages, 54 traced requirements and native `node:test` tests. Requires Node 24+ on a local POSIX filesystem.

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run test:workspaces
npm run demo
```

The demo records history in `.demo-state/`, pauses for logical time and a signal, restarts its engine, retries a failed activity, and completes. Re-running it replays completion without executing finished activities.
Its simulated provider ledger is in memory for illustration only; real providers must persist their effect-key ledger.

## API

`History(directory)` owns an fsynced, SHA-256-chained JSONL log. `Registry.register({ name, version, steps })` registers an immutable data-only workflow. Steps are sequential `activity`, `timer`, or `signal` commands. Activities specify `{ maxAttempts, base, cap }` retries and optional compensation names.

`new Engine(history, registry, clock, handlers)` exposes:

- `start(runId, definitionName, input, version?)`: persist input, selected version, definition snapshot and digest. An existing run ID cannot be overwritten.
- `tick(runId)`: progress until waiting, completed, compensating, or failed; persist attempts **before** calling effects. The result includes status and the latest output.
- `signal(runId, signalId, name, payload)`: durable FIFO buffering, identical-ID deduplication and content-conflict rejection. Signal payload becomes the next command's input.
- `LogicalClock.advanceTo(milliseconds)`: monotonic caller-controlled time; no wall-clock sleeps. Deadlines survive restarts. `TimerQueue` is an optional rebuildable scheduling index.

Only own callable handler properties are registered. Missing activity handlers cause permanent failure; missing compensation handlers leave the workflow compensating until operators restore that provider. `PermanentError` skips activity retries. Compensations run in reverse completed-activity order, retaining successful outputs.

## Durability and replay contract

- A run pins its definition version and canonical digest. Register every historical version before replay; semantic changes under an existing version fail before any effect.
- External effects are **at least once**, not magically exactly once. Providers must durably deduplicate `context.effectKey` across restarts. An unresolved activity attempt reuses its recorded attempt and key; compensation retries reuse their key too.
- A run lease protects effects across processes; a short exclusive append lock plus compare-and-append protects history writes. Signals may append while an effect awaits.
- State is reconstructed from the log, not retained in engine memory. Timer deadlines and retry deadlines are persisted; callers must advance a consistent logical clock.
- History reads validate the entire store. Corruption or an incomplete crash tail makes **all** runs in that store unavailable until operator recovery. There is no automatic truncation, stale-lock eviction, distributed-storage support, cancellation, or arbitrary closure replay.
- A write/fsync exception may have an uncertain commit. Reopen and inspect the log before retrying. Crash-orphaned `append.lock` or `run-*.lock` directories require operator verification that no writer owns them. Never clear a live lease.

## SDD evidence

`.sdd/plan.md` orders five T2 features. Specs, AI locks, spike results, a chained Red/Green/refactor ledger and the independent review record are retained under `.sdd/`. Tests 011 and 012 cover two independently identified bug-fix cycles (pending-attempt identity and inherited-provider lookup). Tests 013 and 014 are explicit test-only characterization requirements.

```sh
S=../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs
node "$S" --root "$PWD" impact REQ-HISTORY-005
node "$S" --root "$PWD" gate
```

**Use the full gate here.** The current skill's `gate --changed` does not rebase Git status paths when `--root` is nested inside a larger repository, so it can falsely skip all package tests. Reproductions and other skill findings are in `../findings/app008.md`; no skill files were modified.
