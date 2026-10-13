---
feature: gate-prepare-snapshot
tier: T1
---
| Requirement | Behavior | Test |
| --- | --- | --- |
| REQ-GATESNAPSHOT-001 | When gate --changed runs preparation that rewrites a changed lockfile, the system shall retain the initial change set for workspace members and transitive consumer checks, fail on required check failures, and keep unrelated checks out of scope. | TEST-GATESNAPSHOT-001 |
