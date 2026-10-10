---
feature: validate
tier: T2
approval: auto
---
# validate
Goal: validate untrusted job submissions against contract/job.json.   Non-goals: auth.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-VAL-001 | When a valid job is validated, the system shall return ok with defaults applied (priority 5, maxAttempts 3, runAt = now). | TEST-VAL-001 |
| REQ-VAL-002 | If the input is not a plain object (null, array, primitive), then the system shall return error not_object. | TEST-VAL-002 |
| REQ-VAL-003 | If an unknown field is present, then the system shall return error unknown_field:<name>. | TEST-VAL-003 |
| REQ-VAL-004 | If type is missing or does not match the type pattern, then the system shall return invalid_type. | TEST-VAL-004 |
| REQ-VAL-005 | If priority is not an integer within [0,9], then the system shall return invalid_priority. | TEST-VAL-005 |
| REQ-VAL-006 | If maxAttempts is not an integer within [1,10], then the system shall return invalid_max_attempts. | TEST-VAL-006 |
| REQ-VAL-007 | If the JSON-serialized payload exceeds 1024 UTF-8 bytes, then the system shall return payload_too_large; if not serializable (cycle, bigint), payload_not_json. | TEST-VAL-007 |
| REQ-VAL-008 | If runAt or deadline is not strict ISO-8601 UTC, then the system shall return invalid_run_at / invalid_deadline; if deadline <= runAt, deadline_before_run. | TEST-VAL-008 |
| REQ-VAL-009 | If idempotencyKey does not match the key pattern, then the system shall return invalid_idempotency_key. | TEST-VAL-009 |
| REQ-VAL-010 | The system shall collect all errors (not only the first), sorted ascending and without duplicates. | TEST-VAL-010 |
| REQ-VAL-011 | When runAt/deadline has a year below 0100 (e.g. 0050-01-01T00:00:00Z), the system shall treat it as that literal year, not 1950, and accept valid dates. | TEST-VAL-011 |

## Design
Pure function `validateJob(input, now)` returns `{ok:true, job}` or `{ok:false, errors}`; limits are read from contract/job.json.

| Field | Rule | Error code |
| --- | --- | --- |
| type | required, regex | invalid_type |
| priority | int 0..9 | invalid_priority |
| maxAttempts | int 1..10 | invalid_max_attempts |
| payload | JSON, ≤1024 bytes UTF-8 | payload_too_large / payload_not_json |
| runAt/deadline | `YYYY-MM-DDTHH:MM:SS(.sss)?Z`, real calendar date | invalid_* ; deadline_before_run |

Invariants: V1 ok ⇒ errors empty; V2 errors sorted unique; V3 input never mutated.
## Assumptions / risks
Date.parse is lenient (e.g. 2024-02-30 rolls over): a strict regex plus round-trip check is required.
