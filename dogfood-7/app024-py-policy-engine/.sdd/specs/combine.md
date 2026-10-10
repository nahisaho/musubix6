---
feature: combine
tier: T2
approval: auto
---
# Policy combination
Goal: deterministic four-valued decisions. Non-goals: full XACML subtype semantics.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-COMBINE-001 | When deny-overrides is selected, the system shall use Deny before Indeterminate before Permit before NotApplicable. | TEST-COMBINE-001 |
| REQ-COMBINE-002 | When permit-overrides is selected, the system shall use Permit before Indeterminate before Deny before NotApplicable. | TEST-COMBINE-002 |
| REQ-COMBINE-003 | When first-applicable is selected, the system shall return the first non-NotApplicable result. | TEST-COMBINE-003 |
| REQ-COMBINE-004 | If only-one-applicable has multiple applicable rules, the system shall return Indeterminate. | TEST-COMBINE-004 |
| REQ-COMBINE-005 | When only-one-applicable has one applicable rule, the system shall return its result. | TEST-COMBINE-005 |
| REQ-COMBINE-006 | When any algorithm receives an empty result sequence, the system shall return NotApplicable. | TEST-COMBINE-006 |
| REQ-COMBINE-007 | If an algorithm name is unknown, the system shall reject it. | TEST-COMBINE-007 |
| REQ-COMBINE-008 | If a result is outside the four-value domain, the system shall reject it. | TEST-COMBINE-008 |
## Design
One explicit precedence table defines override algorithms; ordered algorithms never sort inputs.
NotApplicable is neutral; any other value counts as applicable for only-one-applicable.
## Assumptions
Spike: exhaustive two-result Cartesian tables have 16 rows; validated by spikes.py.
