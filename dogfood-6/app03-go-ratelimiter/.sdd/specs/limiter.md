---
feature: limiter
tier: T2
---
# limiter
Goal: per-key limiter registry combining bucket and window. Depends on features bucket, window.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-LIMITER-001 | When Registry.Allow(key) is called for a new key, the system shall create a limiter from the factory and apply it. | TEST-LIMITER-001 |
| REQ-LIMITER-002 | While different keys are used, the system shall rate-limit each key independently. | TEST-LIMITER-002 |
| REQ-LIMITER-003 | When a composite limiter is used, the system shall allow only if both its bucket and its window allow. | TEST-LIMITER-003 |
| REQ-LIMITER-004 | If the window rejects a composite request, then the system shall refund the bucket token it consumed. | TEST-LIMITER-004 |
| REQ-LIMITER-005 | When Sweep(idle) is called, the system shall remove keys not used for at least idle. | TEST-LIMITER-005 |
| REQ-LIMITER-006 | While many goroutines call Registry.Allow concurrently, the system shall create exactly one limiter per key. | TEST-LIMITER-006 |

## Design
- Components: `limiter.Limiter` interface {Allow() bool}; `limiter.Composite{B *bucket.Bucket; W *window.Window}`; `limiter.Registry` (mutex map key->entry{lim,lastUsed}).
- Data flow: Composite.Allow: B.Allow → if false return false; W.Allow → if false B.Refund(1), false.
- Decision: bucket-first-with-refund avoids a window `Undo` API; depends on REQ-BUCKET-009.
## Assumptions / risks
- Refund race with refill is harmless (capped at burst).
