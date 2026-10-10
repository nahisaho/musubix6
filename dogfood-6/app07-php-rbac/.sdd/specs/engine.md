---
feature: engine
tier: T2
approval: auto
---
# engine
Goal: Authorization decisions from policies over roles and attributes with deny-overrides. Depends on roles and conditions.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ENG-001 | When no policy matches a request, the system shall return decision deny with reason default-deny. | TEST-ENG-001 |
| REQ-ENG-002 | When an allow policy matches subject roles (including inherited), action and resource, the system shall return allow. | TEST-ENG-002 |
| REQ-ENG-003 | When both an allow and a deny policy match, the system shall return deny (deny-overrides). | TEST-ENG-003 |
| REQ-ENG-004 | Where a policy has a condition, the system shall require it to evaluate true against subject/resource/env attributes. | TEST-ENG-004 |
| REQ-ENG-005 | When a policy action or resource ends with `*`, the system shall match any value with that prefix. | TEST-ENG-005 |
| REQ-ENG-006 | If a policy condition throws ParseException, then the system shall treat the policy as non-matching for allow and matching for deny (fail closed). | TEST-ENG-006 |
| REQ-ENG-007 | When a decision is made, the system shall report the ids of all matched policies, sorted. | TEST-ENG-007 |
| REQ-ENG-008 | If a policy has an effect other than allow or deny, then the system shall reject it with InvalidArgumentException on add. | TEST-ENG-008 |
| REQ-ENG-009 | If two policies share an id, then the system shall throw LogicException on add. | TEST-ENG-009 |

## Design
- `Policy` value object (id, effect, roles, actions, resources, condition). `PolicyStore` holds policies; `Engine::decide(Request): Decision`.
- Matching: roles via `RoleHierarchy::effectiveRoles`; wildcard suffix `*` only; condition context = `['subject'=>..,'resource'=>..,'env'=>..]`.
- Combining: collect matches; any deny => deny; else any allow => allow; else default-deny.
- Cross-feature: engine imports Rbac\Roles and Rbac\Conditions.
## Assumptions / risks: broken deny condition fails closed (TEST-ENG-006).
