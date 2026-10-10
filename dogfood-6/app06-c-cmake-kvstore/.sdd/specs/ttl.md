---
feature: ttl
tier: T2
approval: auto
---
# ttl
Goal: expiry computed against an injected clock. Non-goals: wall clock access, timers/threads.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-TTL-001 | If the clock or its now function is NULL, then ttl_expires_at shall return KV_EINVAL. | TEST-TTL-001 |
| REQ-TTL-002 | When ttl_ms is 0, the system shall mark the entry as never expiring (expires_at 0). | TEST-TTL-002 |
| REQ-TTL-003 | When ttl_ms is greater than 0, the system shall set expires_at to now plus ttl_ms. | TEST-TTL-003 |
| REQ-TTL-004 | When now is greater than or equal to expires_at of an expiring entry, ttl_is_expired shall return true. | TEST-TTL-004 |
| REQ-TTL-005 | When ttl_remaining is called, the system shall return -1 for never-expiring, 0 for expired, else the remaining milliseconds. | TEST-TTL-005 |
| REQ-TTL-006 | When ttl_sweep is called, the system shall delete every expired entry from the table and return the count removed. | TEST-TTL-006 |
| REQ-TTL-007 | If now plus ttl_ms overflows 64 bits, then the system shall saturate expires_at at UINT64_MAX. | TEST-TTL-007 |

## Design
- Components: kv_clock_t {now(ctx), ctx} injected by caller; ttl.c holds pure functions plus ttl_sweep which delegates to ht_remove_if (cross-feature dependency on hashtable).
- Data flow: store computes expires_at via ttl_expires_at then writes entry->expires_at; reads call ttl_is_expired(entry, now).
- Decisions: expires_at==0 is the sentinel for no expiry (so a real deadline of 0 is impossible because ttl>0 gives now+ttl>=1 when saturating); expiry boundary is inclusive (now >= expires_at).
- State table: live(now<exp) -> expired(now>=exp); never -> never.
## Assumptions / risks
- Saturating add avoids wrap to a small deadline: TEST-TTL-007.
- Sentinel 0 when clock returns 0 and ttl>0: expires_at=ttl>0, fine (TEST-TTL-003).
