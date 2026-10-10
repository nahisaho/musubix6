import { describe, it, expect } from 'vitest';
import { zonedOffsetMinutes, localToEpoch } from '../src/tz';
import { workingWindow, busyFromBookings, freeSlots, isSlotAvailable } from '../src/availability';
import { money, type Booking } from '@bk/domain';

const H = 3600000;
const M = 60000;
const bk = (start: number, end: number, status: Booking['status']): Booking => ({
  id: 'bk_00000001', resource: 'r1', start, end, status, price: money(0, 'JPY'),
});

describe('tz', () => {
  /** @id TEST-AVAIL-001 @verifies REQ-AVAIL-001 */
  it('TEST-AVAIL-001 offsets', () => {
    expect(zonedOffsetMinutes('Asia/Tokyo', Date.UTC(2024, 0, 15))).toBe(540);
    expect(zonedOffsetMinutes('America/New_York', Date.UTC(2024, 0, 15))).toBe(-300);
    expect(zonedOffsetMinutes('America/New_York', Date.UTC(2024, 6, 15))).toBe(-240);
    expect(zonedOffsetMinutes('UTC', 0)).toBe(0);
  });
  /** @id TEST-AVAIL-002 @verifies REQ-AVAIL-002 */
  it('TEST-AVAIL-002 invalid zone', () => {
    expect(() => zonedOffsetMinutes('Mars/Olympus', 0)).toThrow(RangeError);
    expect(() => localToEpoch('Nope', '2024-01-15', '09:00')).toThrow(RangeError);
  });
  /** @id TEST-AVAIL-003 @verifies REQ-AVAIL-003 */
  it('TEST-AVAIL-003 local to epoch', () => {
    expect(localToEpoch('Asia/Tokyo', '2024-01-15', '09:00')).toBe(Date.UTC(2024, 0, 15, 0, 0));
    expect(localToEpoch('America/New_York', '2024-07-15', '09:00')).toBe(Date.UTC(2024, 6, 15, 13, 0));
    expect(localToEpoch('America/New_York', '2024-03-10', '03:30')).toBe(Date.UTC(2024, 2, 10, 7, 30));
  });
  /** @id TEST-AVAIL-004 @verifies REQ-AVAIL-004 */
  it('TEST-AVAIL-004 DST gap', () => {
    expect(() => localToEpoch('America/New_York', '2024-03-10', '02:30')).toThrow(RangeError);
  });
});

describe('availability', () => {
  /** @id TEST-AVAIL-005 @verifies REQ-AVAIL-005 */
  it('TEST-AVAIL-005 working window', () => {
    const w = workingWindow('Asia/Tokyo', '2024-01-15', { open: '09:00', close: '17:00' });
    expect(w).toEqual({ start: Date.UTC(2024, 0, 15, 0), end: Date.UTC(2024, 0, 15, 8) });
    expect(() => workingWindow('Asia/Tokyo', '2024-01-15', { open: '17:00', close: '09:00' })).toThrow(RangeError);
  });
  /** @id TEST-AVAIL-006 @verifies REQ-AVAIL-006 */
  it('TEST-AVAIL-006 busy ignores cancelled', () => {
    const busy = busyFromBookings([bk(0, 2 * H, 'pending'), bk(H, 3 * H, 'confirmed'), bk(10 * H, 12 * H, 'cancelled'), bk(20 * H, 21 * H, 'completed')]);
    expect(busy).toEqual([{ start: 0, end: 3 * H }, { start: 20 * H, end: 21 * H }]);
  });
  /** @id TEST-AVAIL-007 @verifies REQ-AVAIL-007 */
  it('TEST-AVAIL-007 free slots', () => {
    const win = { start: 0, end: 4 * H };
    const slots = freeSlots(win, [{ start: H, end: 2 * H }], 60, 30);
    expect(slots).toEqual([
      { start: 0, end: H },
      { start: 2 * H, end: 3 * H },
      { start: 2 * H + 30 * M, end: 3 * H + 30 * M },
      { start: 3 * H, end: 4 * H },
    ]);
    expect(freeSlots(win, [], 300, 30)).toEqual([]);
    expect(freeSlots({ start: 10 * M, end: 4 * H }, [], 120, 60)).toEqual([{ start: 10 * M, end: 10 * M + 2 * H }, { start: 10 * M + H, end: 10 * M + 3 * H }]);
  });
  /** @id TEST-AVAIL-008 @verifies REQ-AVAIL-008 */
  it('TEST-AVAIL-008 slot availability', () => {
    const win = { start: 0, end: 8 * H };
    const busy = [{ start: 2 * H, end: 3 * H }];
    expect(isSlotAvailable(win, busy, { start: 3 * H, end: 4 * H })).toBe(true);
    expect(isSlotAvailable(win, busy, { start: 2 * H + M, end: 4 * H })).toBe(false);
    expect(isSlotAvailable(win, busy, { start: 7 * H, end: 9 * H })).toBe(false);
  });
});
