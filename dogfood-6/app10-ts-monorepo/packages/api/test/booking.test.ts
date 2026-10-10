import { describe, it, expect } from 'vitest';
import { createBooking, cancelBooking } from '../src/handlers';
import { money, type Booking } from '@bk/domain';

const body = (over: Record<string, unknown> = {}) => ({
  resource: 'room-1', start: '2024-01-15T09:00:00+09:00', end: '2024-01-15T10:00:00+09:00',
  timeZone: 'Asia/Tokyo', priceCents: 5000, currency: 'JPY', ...over,
});
const existing = (over: Partial<Booking> = {}): Booking => ({
  id: 'bk_00000001', resource: 'room-1', start: Date.UTC(2024, 0, 15, 0, 30), end: Date.UTC(2024, 0, 15, 1, 30),
  status: 'confirmed', price: money(1, 'JPY'), ...over,
});

describe('createBooking', () => {
  /** @id TEST-BOOKING-001 @verifies REQ-BOOKING-001 */
  it('TEST-BOOKING-001 creates pending booking', () => {
    const r = createBooking(body(), [], 7);
    expect(r.status).toBe(201);
    expect(r.body).toEqual({
      id: 'bk_00000007', resource: 'room-1', status: 'pending',
      start: Date.UTC(2024, 0, 15, 0), end: Date.UTC(2024, 0, 15, 1), price: { amount: 5000, currency: 'JPY' },
    });
  });
  /** @id TEST-BOOKING-002 @verifies REQ-BOOKING-002 */
  it('TEST-BOOKING-002 400 on invalid', () => {
    const r = createBooking(body({ resource: '' }), [], 1);
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ errors: [{ field: 'resource', message: expect.any(String) }] });
  });
  /** @id TEST-BOOKING-003 @verifies REQ-BOOKING-003 */
  it('TEST-BOOKING-003 409 on overlap, ignoring cancelled and other resources', () => {
    expect(createBooking(body(), [existing()], 2).status).toBe(409);
    expect(createBooking(body(), [existing({ status: 'cancelled' })], 2).status).toBe(201);
    expect(createBooking(body(), [existing({ resource: 'room-2' })], 2).status).toBe(201);
    expect(createBooking(body(), [existing({ start: Date.UTC(2024, 0, 15, 1), end: Date.UTC(2024, 0, 15, 2) })], 2).status).toBe(201);
  });
});

describe('cancelBooking', () => {
  /** @id TEST-BOOKING-004 @verifies REQ-BOOKING-004 */
  it('TEST-BOOKING-004 cancels pending/confirmed', () => {
    for (const s of ['pending', 'confirmed'] as const) {
      const b = existing({ status: s });
      const r = cancelBooking(b);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ ...b, status: 'cancelled' });
    }
  });
  /** @id TEST-BOOKING-005 @verifies REQ-BOOKING-005 */
  it('TEST-BOOKING-005 422 for terminal', () => {
    for (const s of ['completed', 'cancelled'] as const) {
      const b = existing({ status: s });
      const r = cancelBooking(b);
      expect(r.status).toBe(422);
      expect(b.status).toBe(s);
    }
  });
});
