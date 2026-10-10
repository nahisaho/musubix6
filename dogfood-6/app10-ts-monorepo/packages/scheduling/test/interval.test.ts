import { describe, it, expect } from 'vitest';
import { makeInterval, overlaps, mergeIntervals, subtractIntervals, contains, durationMinutes } from '../src/interval';

const iv = (s: number, e: number) => ({ start: s, end: e });

describe('interval', () => {
  /** @id TEST-INTERVAL-001 @verifies REQ-INTERVAL-001 */
  it('TEST-INTERVAL-001 makeInterval validates', () => {
    expect(makeInterval(1, 5)).toEqual(iv(1, 5));
    expect(() => makeInterval(5, 5)).toThrow(RangeError);
    expect(() => makeInterval(5, 1)).toThrow(RangeError);
    expect(() => makeInterval(NaN, 1)).toThrow(RangeError);
  });
  /** @id TEST-INTERVAL-002 @verifies REQ-INTERVAL-002 */
  it('TEST-INTERVAL-002 overlaps is half-open', () => {
    expect(overlaps(iv(0, 10), iv(5, 15))).toBe(true);
    expect(overlaps(iv(0, 10), iv(10, 20))).toBe(false);
    expect(overlaps(iv(10, 20), iv(0, 10))).toBe(false);
    expect(overlaps(iv(0, 10), iv(2, 3))).toBe(true);
  });
  /** @id TEST-INTERVAL-003 @verifies REQ-INTERVAL-003 */
  it('TEST-INTERVAL-003 merges', () => {
    const input = [iv(10, 20), iv(0, 5), iv(5, 8), iv(15, 30)];
    const copy = JSON.parse(JSON.stringify(input));
    expect(mergeIntervals(input)).toEqual([iv(0, 8), iv(10, 30)]);
    expect(input).toEqual(copy);
    expect(mergeIntervals([])).toEqual([]);
  });
  /** @id TEST-INTERVAL-007 @verifies REQ-INTERVAL-007 */
  it('TEST-INTERVAL-007 nested interval keeps outer end', () => {
    expect(mergeIntervals([iv(0, 100), iv(10, 20)])).toEqual([iv(0, 100)]);
    expect(subtractIntervals(iv(0, 200), [iv(0, 100), iv(10, 20)])).toEqual([iv(100, 200)]);
  });
  /** @id TEST-INTERVAL-004 @verifies REQ-INTERVAL-004 */
  it('TEST-INTERVAL-004 subtracts', () => {
    expect(subtractIntervals(iv(0, 100), [iv(10, 20), iv(15, 30), iv(90, 120), iv(-5, 0)])).toEqual([iv(0, 10), iv(30, 90)]);
    expect(subtractIntervals(iv(0, 10), [])).toEqual([iv(0, 10)]);
    expect(subtractIntervals(iv(0, 10), [iv(-1, 11)])).toEqual([]);
  });
  /** @id TEST-INTERVAL-005 @verifies REQ-INTERVAL-005 */
  it('TEST-INTERVAL-005 contains', () => {
    expect(contains(iv(0, 10), iv(0, 10))).toBe(true);
    expect(contains(iv(0, 10), iv(1, 11))).toBe(false);
    expect(contains(iv(5, 10), iv(4, 6))).toBe(false);
  });
  /** @id TEST-INTERVAL-006 @verifies REQ-INTERVAL-006 */
  it('TEST-INTERVAL-006 duration', () => {
    expect(durationMinutes(iv(0, 90 * 60000))).toBe(90);
  });
});
