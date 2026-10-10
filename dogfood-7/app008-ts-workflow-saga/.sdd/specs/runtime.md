---
feature: runtime
tier: T2
approval: auto
---
# Durable replay runtime
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-RUNTIME-001 | When a workflow starts and is ticked, commands shall execute sequentially with durable completion and output chaining. | TEST-RUNTIME-001 |
| REQ-RUNTIME-002 | When a completed run is replayed after restart, completed activities shall not execute again. | TEST-RUNTIME-002 |
| REQ-RUNTIME-003 | When a new definition version is registered, existing runs shall remain pinned to their original version. | TEST-RUNTIME-003 |
| REQ-RUNTIME-004 | When a timer is replayed, its persisted deadline shall remain unchanged and fire only when logical time reaches it. | TEST-RUNTIME-004 |
| REQ-RUNTIME-005 | When an activity fails transiently, retries shall occur only at persisted backoff deadlines and stop at the limit. | TEST-RUNTIME-005 |
| REQ-RUNTIME-006 | When a signal arrives before or during a wait, the runtime shall buffer it and consume it exactly once. | TEST-RUNTIME-006 |
| REQ-RUNTIME-007 | When a signal identifier is repeated, the runtime shall reject changed content and deduplicate identical content. | TEST-RUNTIME-007 |
| REQ-RUNTIME-008 | When an activity fails permanently, completed activities shall be compensated in reverse order before terminal failure. | TEST-RUNTIME-008 |
| REQ-RUNTIME-009 | While an executor is running a workflow, another executor shall be rejected without duplicate activity calls. | TEST-RUNTIME-009 |
| REQ-RUNTIME-010 | If a pinned definition differs on restart, the runtime shall reject replay before performing effects. | TEST-RUNTIME-010 |
| REQ-RUNTIME-011 | When a persisted activity attempt lacks an outcome, replay shall reuse its attempt number and effect key without scheduling a new attempt. | TEST-RUNTIME-011 |
| REQ-RUNTIME-012 | If an activity or compensation has no own callable registered handler, execution shall record failure rather than invoking inherited properties. | TEST-RUNTIME-012 |
| REQ-RUNTIME-013 (test-only) | When compensation fails and the process restarts, replay shall retry it with the same key and avoid repeating completed compensation. | TEST-RUNTIME-013 |
| REQ-RUNTIME-014 (test-only) | When a signal is written while an activity awaits, execution shall preserve both the signal and activity result without a stale-sequence failure. | TEST-RUNTIME-014 |
## Design
History is source of truth. State is projected from commands/outcomes; start persists definition snapshot/digest/input.
Each tick holds a store-backed run lease; attempts persist before effects and use stable idempotency keys.
States: running -> waiting -> running -> completed; exhausted/permanent failure -> compensating -> failed.
## Assumptions
Signal writes are allowed while effects await; executor appends refresh CAS after each awaited effect.
Pending attempts replay with the same effect key; compensations may be retried after failures.
Handlers form an explicit own-property callable allowlist; inherited JavaScript object members are not providers.
