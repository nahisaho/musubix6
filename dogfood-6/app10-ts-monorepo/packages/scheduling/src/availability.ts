import type { Booking } from '@bk/domain';
import { localToEpoch } from './tz';
import { makeInterval, mergeIntervals, subtractIntervals, overlaps, contains, type Interval } from './interval';

/** @id CODE-AVAIL-003 @implements REQ-AVAIL-005 */
export function workingWindow(tz: string, date: string, hours: { open: string; close: string }): Interval {
  return makeInterval(localToEpoch(tz, date, hours.open), localToEpoch(tz, date, hours.close));
}

/** @id CODE-AVAIL-004 @implements REQ-AVAIL-006 */
export function busyFromBookings(bookings: readonly Booking[]): Interval[] {
  return mergeIntervals(bookings.filter((b) => b.status !== 'cancelled').map((b) => ({ start: b.start, end: b.end })));
}

/** @id CODE-AVAIL-005 @implements REQ-AVAIL-007 */
export function freeSlots(window: Interval, busy: readonly Interval[], durationMin: number, stepMin: number): Interval[] {
  const dur = durationMin * 60000;
  const step = stepMin * 60000;
  const out: Interval[] = [];
  for (const gap of subtractIntervals(window, busy)) {
    let s = window.start + Math.ceil((gap.start - window.start) / step) * step;
    for (; s + dur <= gap.end; s += step) out.push({ start: s, end: s + dur });
  }
  return out;
}

/** @id CODE-AVAIL-006 @implements REQ-AVAIL-008 */
export function isSlotAvailable(window: Interval, busy: readonly Interval[], slot: Interval): boolean {
  return contains(window, slot) && !busy.some((b) => overlaps(b, slot));
}
