import { newBookingId, transition, IllegalTransitionError, type Booking } from '@bk/domain';
import { busyFromBookings, isSlotAvailable } from '@bk/scheduling';
import { validateCreateRequest, type FieldError } from './validate';

export type Response<T> = { status: number; body: T };

/** @id CODE-BOOKING-001 @implements REQ-BOOKING-001 REQ-BOOKING-002 REQ-BOOKING-003 */
export function createBooking(body: unknown, existing: readonly Booking[], seq: number): Response<Booking | { errors: FieldError[] } | { error: string }> {
  const v = validateCreateRequest(body);
  if (!v.ok) return { status: 400, body: { errors: v.errors } };
  const { resource, interval, price } = v.value;
  const busy = busyFromBookings(existing.filter((b) => b.resource === resource));
  if (!isSlotAvailable(interval, busy, interval)) return { status: 409, body: { error: 'slot not available' } };
  return { status: 201, body: { id: newBookingId(seq), resource, start: interval.start, end: interval.end, status: 'pending', price } };
}

/** @id CODE-BOOKING-002 @implements REQ-BOOKING-004 REQ-BOOKING-005 */
export function cancelBooking(b: Booking): Response<Booking | { error: string }> {
  try {
    return { status: 200, body: { ...b, status: transition(b.status, 'cancelled') } };
  } catch (e) {
    if (e instanceof IllegalTransitionError) return { status: 422, body: { error: e.message } };
    throw e;
  }
}
