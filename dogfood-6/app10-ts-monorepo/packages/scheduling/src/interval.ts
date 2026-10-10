export interface Interval { start: number; end: number }

/** @id CODE-INTERVAL-001 @implements REQ-INTERVAL-001 */
export function makeInterval(start: number, end: number): Interval {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new RangeError('invalid interval');
  return { start, end };
}

/** @id CODE-INTERVAL-002 @implements REQ-INTERVAL-002 */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** @id CODE-INTERVAL-003 @implements REQ-INTERVAL-003 REQ-INTERVAL-007 */
export function mergeIntervals(list: readonly Interval[]): Interval[] {
  const sorted = list.map((i) => ({ ...i })).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push(i);
  }
  return out;
}

/** @id CODE-INTERVAL-004 @implements REQ-INTERVAL-004 */
export function subtractIntervals(base: Interval, busy: readonly Interval[]): Interval[] {
  const out: Interval[] = [];
  let cursor = base.start;
  for (const b of mergeIntervals(busy)) {
    if (b.end <= cursor) continue;
    if (b.start >= base.end) break;
    if (b.start > cursor) out.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < base.end) out.push({ start: cursor, end: base.end });
  return out;
}

/** @id CODE-INTERVAL-005 @implements REQ-INTERVAL-005 */
export function contains(outer: Interval, inner: Interval): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

/** @id CODE-INTERVAL-006 @implements REQ-INTERVAL-006 */
export function durationMinutes(i: Interval): number {
  return (i.end - i.start) / 60000;
}
