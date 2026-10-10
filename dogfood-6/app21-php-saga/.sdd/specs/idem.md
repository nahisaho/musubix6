---
feature: idem
tier: T2
---
# idem
Goal: Idempotency keys and a TTL-bound idempotency store using the injected clock. Non-goals: distributed locking.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-IDEM-001 | When a key is derived for (sagaId, step, phase), the system shall return a deterministic 64-hex string that differs for any differing component. | TEST-IDEM-001 |
| REQ-IDEM-002 | If components contain the separator characters, then key derivation shall still differ (length-prefixed encoding, no ambiguity). | TEST-IDEM-002 |
| REQ-IDEM-003 | When begin is called for an unknown key, the system shall return NEW and mark the key in flight. | TEST-IDEM-003 |
| REQ-IDEM-004 | While a key is in flight, begin with the same payload hash shall return IN_FLIGHT. | TEST-IDEM-004 |
| REQ-IDEM-005 | When a key is completed, begin shall return REPLAY with the stored result. | TEST-IDEM-005 |
| REQ-IDEM-006 | If begin is called for an existing key with a different payload hash, then the system shall throw IdempotencyConflict. | TEST-IDEM-006 |
| REQ-IDEM-007 | When a key is released, begin shall return NEW again; completing an unknown key shall throw LogicException. | TEST-IDEM-007 |
| REQ-IDEM-008 | When a completed key is older than or equal to the TTL on the clock, begin shall treat it as unknown and return NEW. | TEST-IDEM-008 |
| REQ-IDEM-009 | When execute is called repeatedly with the same key and payload, the system shall run the callable once and return the cached result. | TEST-IDEM-009 |
| REQ-IDEM-010 | If the callable throws, then execute shall release the key, rethrow, and allow a later execute to run again. | TEST-IDEM-010 |
| REQ-IDEM-011 | If execute is called while the key is IN_FLIGHT, then the system shall throw InFlight (a RuntimeException) without invoking the callable (bug fix: callable was run a second time). | TEST-IDEM-011 |

## Design
Key state table (payload hash h, ttl T measured from completion time c):
| existing record | begin(h') | result |
| --- | --- | --- |
| none / expired (now-c >= T) | any | NEW (records IN_FLIGHT) |
| IN_FLIGHT h | h | IN_FLIGHT |
| COMPLETED h, fresh | h | REPLAY(result) |
| any h | h' != h | throw IdempotencyConflict |
Key = sha256 of `len(sagaId):sagaId|len(step):step|len(phase):phase`. Invariants: a callable runs at most once per live key; IN_FLIGHT never expires (only release clears it).
## Assumptions / risks: expiry boundary `>=` retired by TEST-IDEM-008.
