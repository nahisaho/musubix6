---
feature: roles
tier: T2
approval: auto
---
# roles
Goal: Role hierarchy with inheritance and cycle protection. Non-goals: persistence.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ROLES-001 | When a role name is added to the hierarchy, the system shall make it known. | TEST-ROLES-001 |
| REQ-ROLES-002 | If a role name is empty or has characters outside [A-Za-z0-9_.-], then the system shall throw InvalidArgumentException. | TEST-ROLES-002 |
| REQ-ROLES-003 | When a parent is declared for a role, the system shall record that role as inheriting from the parent. | TEST-ROLES-003 |
| REQ-ROLES-004 | If a parent declaration would create a cycle (including self-parent), then the system shall throw LogicException and leave the hierarchy unchanged. | TEST-ROLES-004 |
| REQ-ROLES-005 | When effective roles of a role are requested, the system shall return the role plus all transitive ancestors without duplicates. | TEST-ROLES-005 |
| REQ-ROLES-006 | If an unknown role is queried for effective roles, then the system shall return an empty list (fail closed). | TEST-ROLES-006 |
| REQ-ROLES-007 | When effective roles of several roles are requested, the system shall return the sorted union. | TEST-ROLES-007 |

## Design
- `Rbac\Roles\RoleHierarchy` holds `parents: array<string, string[]>`; DAG enforced at `inherit()` by DFS from the parent looking for the child.
- Name validation in one private function used by all entry points; effective-role traversal is iterative with a visited set (diamond-safe).
- Unknown role => empty (deny by default downstream). Spike: diamond inheritance yields no duplicates.
## Assumptions / risks: cycles are retired by TEST-ROLES-004; diamonds by TEST-ROLES-005.
