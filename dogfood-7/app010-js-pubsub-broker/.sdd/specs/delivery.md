---
feature: delivery
tier: T2
approval: auto
---
# Delivery
Goal: Atomic broker effects and poison-message routing. Non-goals: exactly-once external side effects.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DELIVERY-001 | When publishing with a nonempty idempotency key, the broker shall return the original record for identical retries without appending. | TEST-DELIVERY-001 |
| REQ-DELIVERY-002 | If an idempotency key is reused with a different semantic request, the broker shall reject without mutation. | TEST-DELIVERY-001 |
| REQ-DELIVERY-003 | When a member transaction commits, the broker shall atomically append staged outputs and commit its delivered input offsets. | TEST-DELIVERY-002 |
| REQ-DELIVERY-004 | If any output/offset validation fails, the broker shall abort the transaction without publishing, committing or recording its transaction ID. | TEST-DELIVERY-002 |
| REQ-DELIVERY-005 | When a completed transaction ID is retried with identical content, the broker shall return its original result without repeating effects. | TEST-DELIVERY-003 |
| REQ-DELIVERY-006 | If a transaction has a stale generation or reused ID with different content, the broker shall reject; distinct groups shall have independent transaction IDs. | TEST-DELIVERY-003 |
| REQ-DELIVERY-007 | When a retained delivered record fails below maxAttempts, the broker shall seek for retry; if retention removed it, the broker shall reject without committing. | TEST-DELIVERY-004 |
| REQ-DELIVERY-008 | When maxAttempts is reached, the broker shall atomically write one provenance-bearing dead letter and commit past the poison record. | TEST-DELIVERY-004 |
| REQ-DELIVERY-009 | When user IDs equal internal dead-letter IDs, the broker shall isolate their namespaces and still complete both effects. | TEST-DELIVERY-005 |
| REQ-DELIVERY-010 | When retention overtakes a group's commit, the broker shall accept failure of its earliest retained delivered record without skipping retained inputs. | TEST-DELIVERY-006 |
| REQ-DELIVERY-011 | If commit/output arrays contain holes, the broker shall reject before appending, acknowledging or recording a transaction ID. | TEST-DELIVERY-007 |
## Design
Delivery owns dedupe, transaction and retry maps; it prevalidates using a cloned Log snapshot.
Transactions use a single synchronous commit boundary; DLQ route calls the same transaction path.
## Assumptions / risks
Semantic equality uses node:util isDeepStrictEqual, including cycles; ID namespace is per topic/group.
Caller provides a precreated DLQ and earliest retained uncommitted input; internal IDs have a separate namespace.
