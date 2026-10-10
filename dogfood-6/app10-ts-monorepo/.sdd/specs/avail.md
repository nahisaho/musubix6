---
feature: avail
tier: T2
---
# avail
Goal: time-zone aware availability.   Non-goals: recurring rules.   Depends: domain, interval.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-AVAIL-001 | When zonedOffsetMinutes(tz,epochMs) is called, the system shall return the UTC offset in minutes of tz at that instant. | TEST-AVAIL-001 |
| REQ-AVAIL-002 | If a time zone is not a valid IANA name, then the system shall throw RangeError. | TEST-AVAIL-002 |
| REQ-AVAIL-003 | When localToEpoch(tz,date,time) is called with an existing local time, the system shall return the matching epoch ms. | TEST-AVAIL-003 |
| REQ-AVAIL-004 | If the local time does not exist (DST gap), then the system shall throw RangeError. | TEST-AVAIL-004 |
| REQ-AVAIL-005 | When workingWindow(tz,date,{open,close}) is called, the system shall return the Interval between the two local times. | TEST-AVAIL-005 |
| REQ-AVAIL-006 | When busyFromBookings(bookings) is called, the system shall return merged intervals of bookings whose status is not cancelled. | TEST-AVAIL-006 |
| REQ-AVAIL-007 | When freeSlots(window,busy,durationMin,stepMin) is called, the system shall return slot intervals of that duration, start aligned to stepMin from the window start, fully inside free gaps. | TEST-AVAIL-007 |
| REQ-AVAIL-008 | When isSlotAvailable(window,busy,slot) is called, the system shall return true iff slot is inside window and overlaps no busy interval. | TEST-AVAIL-008 |

## Design
Components: tz.ts (Intl.DateTimeFormat offset, local→epoch by fixed-point on offset, round-trip check detects DST gaps), availability.ts (uses interval ops and domain BookingStatus).
Data flow: booking[] -> busyFromBookings -> merged busy; window - busy = gaps; gaps -> aligned slots.
Decisions: ambiguous (DST overlap) local times resolve to the earlier offset; epoch ms numbers everywhere internally.
## Assumptions / risks
Intl with timeZone available in Node ≥20 (spike: Asia/Tokyo, America/New_York DST dates in TEST-AVAIL-001/004).
