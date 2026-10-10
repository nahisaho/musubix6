---
feature: inventory
tier: T2
approval: auto
---
# inventory
Goal: pure SKU stock aggregate (decide/evolve) with reservations. Non-goals: persistence.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-INV-001 | When evolve folds StockReceived, StockReserved, ReservationReleased and StockShipped events, the system shall produce {onHand, reserved} state. | TEST-INV-001 |
| REQ-INV-002 | When receive(qty) has a positive integer qty, the system shall emit StockReceived; otherwise it shall throw RangeError. | TEST-INV-002 |
| REQ-INV-003 | When reserve(orderId, qty) is requested and onHand minus reserved total >= qty, the system shall emit StockReserved. | TEST-INV-003 |
| REQ-INV-004 | If available stock is less than qty, then reserve shall throw InsufficientStockError. | TEST-INV-004 |
| REQ-INV-005 | If orderId already holds a reservation, then reserve shall throw DomainError. | TEST-INV-005 |
| REQ-INV-006 | When release(orderId) targets an existing reservation, the system shall emit ReservationReleased; otherwise it shall throw DomainError. | TEST-INV-006 |
| REQ-INV-007 | When ship(orderId) targets an existing reservation, the system shall emit StockShipped reducing onHand and removing the reservation; otherwise it shall throw DomainError. | TEST-INV-007 |

## Design
Pure module: initialState = {onHand:0, reserved:{}}; evolve(state, event) returns a new state; decide(state, command) returns event array.
Reservation table: none -> reserved (reserve) -> released | shipped (terminal for that orderId); duplicate reserve and release/ship of unknown id are DomainErrors.
available = onHand - sum(reserved). Errors: DomainError base, InsufficientStockError extends it.
## Assumptions / risks
Quantities are integers; non-integers rejected by REQ-INV-002/003 guards.
