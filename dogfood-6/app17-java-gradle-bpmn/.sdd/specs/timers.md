---
feature: timers
tier: T2
---
# timers
Goal: timer nodes driven by an injected clock: ISO-8601 durations, an indexed min-heap timer queue and a service that fires timers in order. Non-goals: wall-clock threads, cron, timezones, boundary timer events.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-TIMERS-001 | The ManualClock shall return its current epoch milliseconds, advance by a non-negative amount, and throw IllegalArgumentException when set to an earlier instant. | TEST-TIMERS-001 |
| REQ-TIMERS-002 | When Durations.parse receives an ISO-8601 duration of the form `P[nD][T[nH][nM][n[.f]S]]`, it shall return the length in milliseconds. | TEST-TIMERS-002 |
| REQ-TIMERS-003 | If the duration text is empty after `P`/`PT`, has no `P`, has components out of order, repeated or negative, or has a time component without `T`, then Durations.parse shall throw IllegalArgumentException. | TEST-TIMERS-003 |
| REQ-TIMERS-004 | Durations.parse shall keep millisecond precision of fractional seconds (up to 3 digits), reject more than 3 fraction digits, and throw IllegalArgumentException instead of overflowing long. | TEST-TIMERS-004 |
| REQ-TIMERS-005 | The TimerQueue shall return due timers ordered by due time and, for equal due times, by scheduling order. | TEST-TIMERS-005 |
| REQ-TIMERS-006 | When TimerQueue.cancel is called with a scheduled id it shall remove the timer and return true; for an unknown id it shall return false; scheduling an existing id shall throw IllegalArgumentException. | TEST-TIMERS-006 |
| REQ-TIMERS-007 | When TimerQueue.pollDue(now) is called, it shall remove and return exactly the timers with due <= now. | TEST-TIMERS-007 |
| REQ-TIMERS-008 | For any sequence of schedule, cancel and poll operations, the TimerQueue shall behave like a stable sort of the pending timers. | TEST-TIMERS-008 |
| REQ-TIMERS-009 | When a token enters a timer node, the engine shall set it WAITING and call the registered timer hook; the TimerService shall schedule it at now plus the node `duration`. | TEST-TIMERS-009 |
| REQ-TIMERS-010 | When TimerService.advanceTo(target) is called, it shall fire every due timer in due order, set the clock to each timer's due time while firing it, fire timers scheduled by firing within the same call, and finally set the clock to target. | TEST-TIMERS-010 |
| REQ-TIMERS-011 | When an instance is terminated through the TimerService or is no longer RUNNING, the service shall cancel or skip its pending timers so that they never fire. | TEST-TIMERS-011 |
| REQ-TIMERS-012 | If a timer node's `duration` is missing or invalid, then the engine shall FAIL the instance with BAD_TIMER. | TEST-TIMERS-012 |
| REQ-TIMERS-013 | While a timer in one parallel branch is pending, the gateway join shall stay blocked; it shall fire after the timer has fired. | TEST-TIMERS-013 |
| REQ-TIMERS-014 | If ManualClock.advance would overflow the long millisecond range, then it shall throw IllegalArgumentException and leave the clock unchanged; a timer whose due time would overflow shall FAIL the instance with BAD_TIMER. | TEST-TIMERS-014 |

## Design
Components: `Clock` (interface `long nowMillis()`), `ManualClock`, `Durations` (hand-written scanner), `TimerQueue` (array binary min-heap keyed by (due, seq) plus `HashMap<id, index>` for O(log n) cancel), `TimerService(Engine, Clock)`; engine additions: `TimerHook` interface, `Engine.onTimer`, `Instance.id()` (`i1`, `i2`, ...).
Data flow: service.start -> engine.start (hook arms timers for tokens reaching TIMER nodes) -> advanceTo(t) -> pop due timer -> clock.set(due) -> engine.complete(token) -> hook may arm more timers -> repeat -> clock.set(t).

| Duration grammar | Meaning |
| --- | --- |
| `P` then optional `nD` | days (24h) |
| `T` then optional `nH`, `nM`, `n[.fff]S` in this order, each at most once | hours/minutes/seconds |
| any other text, `P`, `PT`, trailing `T` without components | IllegalArgumentException |

| Timer state | Event | Next |
| --- | --- | --- |
| absent | schedule(id, due) | PENDING |
| PENDING | pollDue(now >= due) | FIRED (removed) |
| PENDING | cancel(id) | CANCELLED (removed) |
| PENDING/FIRED/CANCELLED | schedule(id) while PENDING | IllegalArgumentException |

Invariants: heap property on (due, seq); `index` map consistent with array positions; clock never moves backwards; every PENDING timer belongs to a WAITING token of a RUNNING instance (stale ones are skipped on fire); seq strictly increases.

## Assumptions / risks
Zero-duration timers fire in the same advanceTo call (TEST-TIMERS-010). Timer ids are `<instanceId>/<tokenId>`; token ids are unique per instance (REQ-TOKENS-003).
