---
feature: orders
tier: T2
---
# orders
Goal: immutable order aggregate with a strict status state machine. Non-goals: persistence.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ORD-001 | When an order is created, the system shall start in Draft status with no items. | TEST-ORD-001 |
| REQ-ORD-002 | When AddItem is called on a Draft order, the system shall return a new order containing the item and leave the original unchanged. | TEST-ORD-002 |
| REQ-ORD-003 | If AddItem is called on an order that is not Draft, then the system shall throw InvalidOrderOperationException. | TEST-ORD-003 |
| REQ-ORD-004 | If an item has quantity <= 0 or a currency different from existing items, then the system shall throw. | TEST-ORD-004 |
| REQ-ORD-005 | When Subtotal is read, the system shall return the sum of quantity x unit price over all items. | TEST-ORD-005 |
| REQ-ORD-006 | When TransitionTo is called with a legal target per the transition table, the system shall return a new order in that status. | TEST-ORD-006 |
| REQ-ORD-007 | If TransitionTo targets a status not allowed by the table (including any exit from Cancelled or Refunded), then the system shall throw InvalidOrderTransitionException. | TEST-ORD-007 |
| REQ-ORD-008 | If a Draft order with no items is moved to Placed, then the system shall throw InvalidOrderTransitionException. | TEST-ORD-008 |

## Design
Components: Order (sealed record, ImmutableList items), OrderStatus enum, Transitions table (single source of truth, static dictionary).
Transition table: Draft->{Placed,Cancelled}; Placed->{Paid,Cancelled}; Paid->{Shipped,Cancelled,Refunded}; Shipped->{Delivered}; Delivered->{Refunded}; Cancelled,Refunded terminal.
Every mutator returns a new Order (with-expression); items list is ImmutableList so aliasing is impossible. Depends on money (REQ-MONEY-001 addition, REQ-MONEY-002 currency check).
## Assumptions / risks: Shipped orders cannot be cancelled (retire via Delivered->Refunded) -- TEST-ORD-007 covers every cell of the table.
