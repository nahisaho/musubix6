---
feature: watch
tier: T2
approval: auto
---
# watch
Goal: Watch streams (package `watch`) delivering ordered, gap-free, duplicate-free events from a chosen revision, with filters, progress notifications and cancellation.
Non-goals: network transport, fragmenting large responses.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-WATCH-001 | When Watch is opened with startRev=0, the hub shall deliver only events committed after the watch was created. | TEST-WATCH-001 |
| REQ-WATCH-002 | When Watch is opened with startRev <= current revision, the hub shall replay history from startRev and then live events in order without gaps or duplicates. | TEST-WATCH-002 |
| REQ-WATCH-003 | When a range [key,end) is watched, the hub shall deliver only events for keys inside the range; PrefixEnd(p) shall return the smallest key greater than every key with prefix p ("\x00" when p is all 0xff). | TEST-WATCH-003 |
| REQ-WATCH-004 | When one revision produces several matching events, the hub shall deliver them in one Response carrying that revision. | TEST-WATCH-004 |
| REQ-WATCH-005 | Where NoPut or NoDelete filters are set, the hub shall drop those event types and shall not send a Response that has no remaining events. | TEST-WATCH-005 |
| REQ-WATCH-006 | Where PrevKV is set, the hub shall attach the previous KeyValue to events; otherwise PrevKV shall be nil. | TEST-WATCH-006 |
| REQ-WATCH-007 | When a stream is cancelled, the hub shall deliver already queued responses, then return ErrCanceled from Next, deliver no further events, and Cancel shall be idempotent. | TEST-WATCH-007 |
| REQ-WATCH-008 | While startRev is in the future (greater than current revision+1), the hub shall skip events with a lower revision and deliver the first event at or after startRev. | TEST-WATCH-008 |
| REQ-WATCH-009 | When Progress is called, the hub shall send an event-less Response carrying the current store revision to every synced stream. | TEST-WATCH-009 |
| REQ-WATCH-010 | When a stream's queue exceeds its limit, the hub shall cancel it with ErrSlowWatcher and assign watcher IDs that are unique and increasing. | TEST-WATCH-010 |

## Design
Components: `watch.Hub` subscribes to `mvcc.Store`; `Stream` = mutex-protected queue + signal channel; one `watcher` per stream with matcher, filters, `lastRev`, `state`.
State table:

| State | Event | Next | Action |
| --- | --- | --- | --- |
| syncing | store notify | syncing | buffer in pending |
| syncing | history replayed | synced | flush pending with rev > lastRev |
| synced | store notify | synced | deliver events with rev > lastRev, update lastRev |
| synced/syncing | Cancel | canceled | remove from hub, mark queue closed |
| any | queue > limit | canceled | final Response Err=ErrSlowWatcher |

Invariants: per stream, delivered revisions strictly increase; a revision is delivered at most once; watcher registered before history is read so no event falls in the gap.
## Assumptions / risks
Pending buffering retires the register-vs-replay race (retired by TEST-WATCH-002 under live writes).
