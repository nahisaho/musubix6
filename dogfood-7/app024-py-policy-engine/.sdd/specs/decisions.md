---
feature: decisions
tier: T2
approval: auto
---
# Decisions and explanations
Goal: deterministic policy evaluation with audit reasons. Non-goals: enforcement transport.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DECISIONS-001 | When an ABAC rule matches, the system shall return its declared effect. | TEST-DECISIONS-001 |
| REQ-DECISIONS-002 | If no rule matches, the system shall return NotApplicable and authorized false. | TEST-DECISIONS-002 |
| REQ-DECISIONS-003 | If required attributes are missing, the system shall mark that rule Indeterminate and combine normally; a final Indeterminate shall not authorize. | TEST-DECISIONS-003 |
| REQ-DECISIONS-004 | When a rule names required roles, the system shall use inherited role closure. | TEST-DECISIONS-004 |
| REQ-DECISIONS-005 | When explaining a decision, the system shall emit ordered rule IDs, outcomes, and reasons without request values. | TEST-DECISIONS-005 |
| REQ-DECISIONS-006 | When returning obligations, the system shall include unique obligations from rules matching the final effect only. | TEST-DECISIONS-006 |
| REQ-DECISIONS-007 | If rule IDs are duplicated or effects invalid, the system shall reject the policy. | TEST-DECISIONS-007 |
| REQ-DECISIONS-008 | When evaluating a request, the system shall not mutate the request or policy inputs. | TEST-DECISIONS-008 |
| REQ-DECISIONS-009 | If a role-guarded request has malformed subject or role data, the system shall mark that rule Indeterminate without throwing or granting permission. | TEST-DECISIONS-009 |
## Design
Compile every rule first, then evaluate conditions and RBAC guards, then combine outcomes.
The result has decision, authorized, trace, obligations; only Permit authorizes; failures reveal paths, not values.
## Assumptions
Spike: JSON-compatible result copies do not alias request objects; validated by spikes.py.
