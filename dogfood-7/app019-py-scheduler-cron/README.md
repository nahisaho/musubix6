# Timezone-aware distributed scheduler model

Python 3.11+ and pytest; standard-library-only implementation.

```sh
python3 -m pytest -q
python3 spikes/runtime.py
node ../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs gate --root "$PWD"
```

Run from this app directory. The full gate is authoritative; in the enclosing
uncommitted repository, the changed gate can report empty evidence scope.

## Components

- `scheduler.cron`: immutable five-field expressions, lists/ranges/steps,
  Sunday 0/7, wildcard-aware day combination, UTC search, IANA timezones.
  Spring gaps are skipped; autumn folds support `first`, `second`, or `both`.
- `scheduler.clock`: monotonic fake UTC time, stable callbacks, cancellation,
  synchronous callback chaining, exception preservation, and execution budgets.
- `scheduler.leases`: atomic RLock ownership, exclusive expiry, increasing
  fencing tokens, renewal, release, and stale-worker rejection.
- `scheduler.queue`: delayed and ready heaps, highest eligible priority,
  FIFO tie-breaking, deduplication, cancellation, and generation-safe reuse.
  Queries must have monotonically nondecreasing timestamps.
- `scheduler.dispatch`: machine-readable state transitions, leased attempts,
  capped exponential retry, permanent failures, worker recovery, cancellation,
  and recurring cron jobs. Recurrence advances from completion time and searches
  up to eight years, including the 2096–2104 leap-year gap.

```python
from datetime import datetime, timezone
from scheduler.clock import create_clock, advance
from scheduler.dispatch import create_scheduler, submit, poll, complete

clock = create_clock(datetime(2026, 1, 1, tzinfo=timezone.utc))
scheduler = create_scheduler(clock, ttl=10)
submit(scheduler, "report", clock.instant, priority=5, base_delay=2)
first = poll(scheduler, "worker-a")
complete(scheduler, first, success=False)
advance(clock, 2)
second = poll(scheduler, "worker-b")
assert second.attempt == 2
assert complete(scheduler, second, success=True)
```

The simulation shares a scheduler/store between workers; it does not claim
cross-process durability or implement network consensus. A single simulation
driver advances the clock; worker-facing queue/lease/scheduler operations lock.
Job handlers are external: polling returns immutable `Run` ownership snapshots.
Lease renewal preserves matching-token snapshots, using stored expiry as truth.

## Workflow evidence

Five T2 features, 44 requirements, 45 annotated tests. Specs independently
reviewed and locked; runtime spike verifies DST and contention. Four bug-fix
cycles cover wildcard semantics, delay overflow, backward queue time, and sparse
recurrence. An additional century-boundary negative control demonstrates that
four years is insufficient, followed by Green with the eight-year horizon.
The fold helper extraction has a recorded refactor cycle. Cross-feature impact,
stale-spec rejection, changed/full gates, weak Reds, and independent risk reviews
were exercised. Ledger and approvals are in `.sdd/`.
