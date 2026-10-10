---
feature: decision
tier: T2
---
# decision
Goal: fraud case decision state machine driven by score band, analyst actions and the clock; every transition audited.   Non-goals: UI, persistence.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DEC-001 | When a case is opened for a scored transaction, the machine shall start it in Pending with version 0. | TEST-DEC-001 |
| REQ-DEC-002 | When AutoRoute is called on a Pending case, the machine shall move Low to Approved, Medium to Review and High to Declined. | TEST-DEC-002 |
| REQ-DEC-003 | When an analyst resolves a Review case, the machine shall move it to Approved or Declined and require a non-blank reason. | TEST-DEC-003 |
| REQ-DEC-004 | If a transition is not in the transition table, then the machine shall throw IllegalTransitionException with from/to and leave state and version unchanged. | TEST-DEC-004 |
| REQ-DEC-005 | While a case is Declined or Chargeback, the machine shall reject every transition. | TEST-DEC-005 |
| REQ-DEC-006 | When Tick is called and a Review case is at least 24h old by the injected clock, the machine shall move it to Escalated; younger cases shall stay. | TEST-DEC-006 |
| REQ-DEC-007 | When an Escalated case is approved, the machine shall require the senior flag; otherwise it shall throw IllegalTransitionException. | TEST-DEC-007 |
| REQ-DEC-008 | When a chargeback is filed on an Approved case, the machine shall move it to Chargeback only within 120 days after approval. | TEST-DEC-008 |
| REQ-DEC-009 | When any transition succeeds, the machine shall append an audit entry with actor, action `from->to` and reason, subject = case id. | TEST-DEC-009 |
| REQ-DEC-010 | The machine shall increase version by exactly 1 per successful transition and History shall hold one record per transition. | TEST-DEC-010 |
| REQ-DEC-011 | If Open is called with a case id already in use, then the machine shall throw InvalidOperationException and leave the existing case unchanged. | TEST-DEC-011 |

## Design
Components: DecisionCase (state, version, history, enteredAt), DecisionMachine (owns cases, clock, AuditTrail), TransitionTable (single source), RiskBand from scoring.

| From | To | Guard |
| --- | --- | --- |
| Pending | Approved | band Low (AutoRoute) |
| Pending | Review | band Medium (AutoRoute) |
| Pending | Declined | band High (AutoRoute) |
| Review | Approved | analyst, reason non-blank |
| Review | Declined | analyst, reason non-blank |
| Review | Escalated | Tick, age >= 24h |
| Escalated | Approved | senior only |
| Escalated | Declined | any analyst |
| Approved | Chargeback | now - approvedAt <= 120d |
| Declined, Chargeback | (none) | terminal |

Invariants: version == History.Count; failed transition changes nothing and writes no audit; terminal states have no outgoing edges.

## Assumptions / risks: 24h and 120d boundaries inclusive (TEST-DEC-006/008).
