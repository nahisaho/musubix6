---
feature: saga
tier: T2
approval: auto
---
# Retry and compensation policy
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SAGA-001 | When retry delay is computed, it shall grow exponentially from the configured base. | TEST-SAGA-001 |
| REQ-SAGA-002 | When exponential delay exceeds its cap, delay shall equal the cap without overflow. | TEST-SAGA-002 |
| REQ-SAGA-003 | If retry arguments are invalid, policy evaluation shall reject them. | TEST-SAGA-003 |
| REQ-SAGA-004 | When a transient attempt fails below the limit, the policy shall return a deterministic retry deadline. | TEST-SAGA-004 |
| REQ-SAGA-005 | When attempts are exhausted, the policy shall return no retry deadline. | TEST-SAGA-005 |
| REQ-SAGA-006 | If a failure is permanent, the policy shall prohibit retries. | TEST-SAGA-006 |
| REQ-SAGA-007 | When successful activities are compensated, compensation shall run in reverse completion order. | TEST-SAGA-007 |
| REQ-SAGA-008 | If an activity has no compensation or was already compensated, it shall be excluded. | TEST-SAGA-008 |
| REQ-SAGA-009 | When compensation work is planned, each item shall retain its recorded output and stable effect key. | TEST-SAGA-009 |
| REQ-SAGA-010 | If a retry deadline exceeds safe integer time, policy evaluation shall reject it. | TEST-SAGA-010 |
## Design
Pure retry policy: attempt 1 delay=base, next=min(cap,base*2^(attempt-1)); permanent/exhausted => terminal failure.
Pure reverse compensation planner derives from recorded successes and completion markers; no mutable retry state.
## Assumptions
Activity and compensation providers honor effect idempotency keys; exactly-once external side effects are not claimed.
The numeric overflow boundary is covered in the spike; cap is validated before evaluation.
