---
feature: roles
tier: T2
approval: auto
---
# Role inheritance
Goal: immutable RBAC hierarchy. Non-goals: external identity providers.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ROLES-001 | When resolving a role, the system shall include its transitive parents. | TEST-ROLES-001 |
| REQ-ROLES-002 | When resolving a diamond, the system shall return unique sorted roles. | TEST-ROLES-002 |
| REQ-ROLES-003 | If inheritance contains a cycle, the system shall reject the graph. | TEST-ROLES-003 |
| REQ-ROLES-004 | If a parent is undeclared, the system shall reject the graph. | TEST-ROLES-004 |
| REQ-ROLES-005 | When checking inherited permission, the system shall grant matching action/resource patterns. | TEST-ROLES-005 |
| REQ-ROLES-006 | If no grant matches, the system shall deny permission. | TEST-ROLES-006 |
| REQ-ROLES-007 | If a subject names an unknown role, the system shall reject it. | TEST-ROLES-007 |
| REQ-ROLES-008 | When requesting no roles, the system shall return an empty closure. | TEST-ROLES-008 |
| REQ-ROLES-009 | If assigned roles are not a list or tuple of strings, the system shall reject them with ValueError. | TEST-ROLES-009 |
| REQ-ROLES-010 | When resolving a valid 1500-role chain, the system shall return its complete closure without recursive stack overflow. | TEST-ROLES-010 |
## Design
Validate the entire graph using iterative traversal before closure; sort and deduplicate the result.
Permissions use case-sensitive shell globs, with no implicit administrator privileges.
## Assumptions
Spike: fnmatchcase separates action/resource patterns and case; validated by spikes.py.
