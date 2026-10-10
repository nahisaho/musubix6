---
feature: logging
tier: T2
approval: auto
---
# Correlated logs
Goal: bounded structured records with trusted trace context.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-LOG-001 | When a context has trace identity, logs shall include its trace and span IDs. | TEST-LOG-001 |
| REQ-LOG-002 | When context lacks trace identity, logs shall omit correlation fields. | TEST-LOG-001 |
| REQ-LOG-003 | When attributes include reserved fields, trusted message, level and trace fields shall win. | TEST-LOG-001 |
| REQ-LOG-004 | When attributes are captured, subsequent caller mutation shall not change stored records. | TEST-LOG-001 |
| REQ-LOG-005 | When records are returned, caller mutation shall not alter internal state. | TEST-LOG-001 |
| REQ-LOG-006 | If capacity is full, then logging shall return an error without dropping earlier records. | TEST-LOG-001 |
| REQ-LOG-007 | When records serialize, their JSON shall preserve attributes and message. | TEST-LOG-001 |
| REQ-LOG-008 | When callers log concurrently, the logger shall remain race-free and preserve capacity. | TEST-LOG-001 |
| REQ-LOG-009 | If context has no identity, then user-supplied trace_id and span_id shall be stripped rather than trusted. | TEST-LOG-002 |
## Design
Mutex-protected bounded slice, shallow-cloned string attributes; JSON standard-library encoding.
Reserved keys: message, level, trace_id, span_id. No content filtering or credential processing.
## Assumptions
Attributes are strings, preventing hidden shared nested object mutation.
Records are chronological by mutex acquisition order, not wall-clock timestamps.
