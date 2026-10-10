import { describe, it, expect } from 'vitest';
import { money, addMoney } from '../src/money';
import { canTransition, transition, IllegalTransitionError, type BookingStatus } from '../src/status';
import { isBookingId, newBookingId } from '../src/ids';

describe('money', () => {
  /** @id TEST-DOMAIN-001 @verifies REQ-DOMAIN-001 */
  it('TEST-DOMAIN-001 builds frozen money', () => {
    const m = money(1500, 'JPY');
    expect(m).toEqual({ amount: 1500, currency: 'JPY' });
    expect(Object.isFrozen(m)).toBe(true);
  });
  /** @id TEST-DOMAIN-002 @verifies REQ-DOMAIN-002 */
  it('TEST-DOMAIN-002 rejects bad money', () => {
    expect(() => money(1.5, 'JPY')).toThrow(RangeError);
    expect(() => money(100, 'jpy')).toThrow(RangeError);
    expect(() => money(100, 'JPYX')).toThrow(RangeError);
  });
  /** @id TEST-DOMAIN-003 @verifies REQ-DOMAIN-003 */
  it('TEST-DOMAIN-003 adds same currency', () => {
    expect(addMoney(money(100, 'USD'), money(250, 'USD'))).toEqual({ amount: 350, currency: 'USD' });
  });
  /** @id TEST-DOMAIN-004 @verifies REQ-DOMAIN-004 */
  it('TEST-DOMAIN-004 rejects currency mismatch', () => {
    expect(() => addMoney(money(100, 'USD'), money(1, 'EUR'))).toThrow('currency mismatch');
  });
});

describe('status', () => {
  const all: BookingStatus[] = ['pending', 'confirmed', 'cancelled', 'completed'];
  const allowed = new Set(['pending>confirmed', 'pending>cancelled', 'confirmed>cancelled', 'confirmed>completed']);
  /** @id TEST-DOMAIN-005 @verifies REQ-DOMAIN-005 */
  it('TEST-DOMAIN-005 transition table is exact', () => {
    for (const a of all) for (const b of all) expect(canTransition(a, b)).toBe(allowed.has(`${a}>${b}`));
  });
  /** @id TEST-DOMAIN-006 @verifies REQ-DOMAIN-006 */
  it('TEST-DOMAIN-006 transition enforces table', () => {
    expect(transition('pending', 'confirmed')).toBe('confirmed');
    expect(() => transition('completed', 'pending')).toThrow(IllegalTransitionError);
  });
});

describe('ids', () => {
  /** @id TEST-DOMAIN-007 @verifies REQ-DOMAIN-007 */
  it('TEST-DOMAIN-007 recognises ids', () => {
    expect(isBookingId('bk_00000042')).toBe(true);
    expect(isBookingId('bk_42')).toBe(false);
    expect(isBookingId('bk_000000421')).toBe(false);
    expect(isBookingId('xx_00000042')).toBe(false);
  });
  /** @id TEST-DOMAIN-008 @verifies REQ-DOMAIN-008 */
  it('TEST-DOMAIN-008 formats ids', () => {
    expect(newBookingId(42)).toBe('bk_00000042');
    expect(newBookingId(99999999)).toBe('bk_99999999');
    expect(() => newBookingId(-1)).toThrow(RangeError);
    expect(() => newBookingId(100000000)).toThrow(RangeError);
    expect(() => newBookingId(1.2)).toThrow(RangeError);
  });
});
