---
feature: orders
tier: T2
approval: auto
---
# orders
Goal: order lifecycle state machine. Non-goals: pricing.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ORD-001 | The system shall export a single TRANSITIONS table mapping state and action to the next state, covering none, placed, paid, shipped and cancelled. | TEST-ORD-001 |
| REQ-ORD-002 | When place is requested in state none, the system shall emit OrderPlaced with items and move to placed. | TEST-ORD-002 |
| REQ-ORD-003 | If an action is not allowed in the current state per TRANSITIONS, then decide shall throw IllegalTransitionError naming state and action. | TEST-ORD-003 |
| REQ-ORD-004 | When pay is requested in state placed, the system shall emit OrderPaid. | TEST-ORD-004 |
| REQ-ORD-005 | When ship is requested in state paid, the system shall emit OrderShipped. | TEST-ORD-005 |
| REQ-ORD-006 | When cancel is requested in state placed or paid, the system shall emit OrderCancelled. | TEST-ORD-006 |
| REQ-ORD-007 | If place is requested with an empty or invalid items list, then the system shall throw RangeError. | TEST-ORD-007 |
| REQ-ORD-008 | When evolve folds order events, the system shall produce {status, items} following TRANSITIONS. | TEST-ORD-008 |

## Design
TRANSITIONS = {none:{place:'placed'}, placed:{pay:'paid',cancel:'cancelled'}, paid:{ship:'shipped',cancel:'cancelled'}, shipped:{}, cancelled:{}} is the single source.
decide(state, {type,...}) checks TRANSITIONS[state.status][type] first, then emits the event; evolve uses the same table via event->action map.
Every cell of the 5x4 state/action matrix is tested including illegal ones.
## Assumptions / risks
items: [{sku, qty}] with positive integer qty.
