# Spec template (`.sdd/specs/<feature>.md`, ≤30 lines)

```md
---
feature: calc
tier: T1            # T0 needs no spec; T2 requires a spec lock
approval: auto      # auto (AI review + lock) | human (only for the cases in SKILL.md)
---
# calc
Goal: <one sentence>   Non-goals: <bullets>

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CALC-001 | When add(a,b) is called, the system shall return a+b. | TEST-CALC-001 |
| REQ-CALC-002 | If an argument is not a number, then the system shall throw TypeError. | TEST-CALC-002 |
| REQ-CALC-003 (deferred) | Overflow handling. | — |

## Design (≤10 lines): components, data flow, key decisions, state/policy tables
## Assumptions / risks: <each with the test or spike that retires it>
```

- IDs: `REQ-<F>-nnn`, `TEST-<F>-nnn`, `CODE-<F>-nnn`; globally unique. Rows marked `deferred` are excluded from coverage.
- Annotations: `/** @id TEST-CALC-001 @verifies REQ-CALC-001 */`, `/** @id CODE-CALC-001 @implements REQ-CALC-001 */`. Python/shell: consecutive `#` lines. Compatible with musubix3 annotations.
- Test title must contain its ID (vitest/jest/node:test); pytest/Go/Cargo use the lower-case underscore form (`test_calc_001`), matched via `{idu}` in `.sdd/config.json` `testCmd`.
- Any edit to the spec invalidates its lock; re-review and re-lock (one command).
