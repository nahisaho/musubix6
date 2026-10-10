---
feature: dispatch
tier: T2
approval: auto
---
# Dispatch and retry policy
Goal: leased worker dispatch, retries, and recurring cron simulation. Non-goals: executing user code.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DISPATCH-001 | When due work is polled, the scheduler shall acquire a fenced lease and increment its attempt. | TEST-DISPATCH-001 |
| REQ-DISPATCH-002 | When completion has a live matching lease, the scheduler shall mark success and refuse duplicate completion. | TEST-DISPATCH-002 |
| REQ-DISPATCH-003 | When retryable completion fails, the scheduler shall requeue after capped exponential delay. | TEST-DISPATCH-003 |
| REQ-DISPATCH-004 | When attempts are exhausted or failure is permanent, the scheduler shall mark dead and not requeue. | TEST-DISPATCH-004 |
| REQ-DISPATCH-005 | When a worker lease expires, polling shall recover its job and fence the old worker. | TEST-DISPATCH-005 |
| REQ-DISPATCH-006 | When recurring cron work succeeds, the scheduler shall schedule the next occurrence without catch-up storms. | TEST-DISPATCH-006 |
| REQ-DISPATCH-007 | When cancelling pending or running work, the scheduler shall remove work or revoke ownership and refuse completion; terminal cancellation shall refuse. | TEST-DISPATCH-007 |
| REQ-DISPATCH-008 | If submission or retry policy is invalid or duplicates an ID, the scheduler shall fail without altering existing work. | TEST-DISPATCH-008 |
| REQ-DISPATCH-009 | When attempt numbers are arbitrarily large, capped retry delay shall avoid overflow and preserve zero-delay policies. | TEST-DISPATCH-009 |
| REQ-DISPATCH-010 | When completing valid sparse calendar recurrence, the scheduler shall search up to eight years rather than leaving successful work running. | TEST-DISPATCH-010 |
## Design
One module table defines pending -> running/cancelled and running -> succeeded/dead/pending/cancelled; terminal states have no exits.
Recurring success takes running -> pending with attempt reset; lost-worker exhaustion takes running -> dead.
Queue, lease store, and fake clock compose under a scheduler RLock; completions require valid fencing and running state.
## Assumptions / risks
Shared scheduler object models workers; TTL recovery consumes attempts and retry exhaustion applies to lost workers.
Cron advances from completion time, not old due time; no secrets or external effects are involved.
