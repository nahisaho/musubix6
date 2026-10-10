---
feature: booking
tier: T2
---
# booking
Goal: create/cancel booking handlers returning HTTP-like responses.   Non-goals: storage.   Depends: domain, avail, validate.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-BOOKING-001 | When createBooking gets a valid request whose slot is free, the system shall return status 201 and a pending Booking with id bk_<seq>. | TEST-BOOKING-001 |
| REQ-BOOKING-002 | If the request is invalid, then createBooking shall return status 400 with the validation errors. | TEST-BOOKING-002 |
| REQ-BOOKING-003 | If the slot overlaps a non-cancelled booking of the same resource, then createBooking shall return status 409. | TEST-BOOKING-003 |
| REQ-BOOKING-004 | When cancelBooking is called on a pending or confirmed booking, the system shall return status 200 and the booking with status cancelled. | TEST-BOOKING-004 |
| REQ-BOOKING-005 | If cancelBooking is called on a completed or cancelled booking, then the system shall return status 422 and leave the booking unchanged. | TEST-BOOKING-005 |

## Design
Components: handlers.ts (pure; storage injected as array + seq). Flow: validate -> filter bookings by resource -> busyFromBookings -> isSlotAvailable(window=whole request, ...) -> new Booking.
State: uses domain transition() for cancel; 422 maps IllegalTransitionError.
Decisions: overlap check ignores cancelled bookings; other resources never conflict.
## Assumptions / risks
Conflict check reuses avail.isSlotAvailable with the slot itself as window (TEST-BOOKING-003).
