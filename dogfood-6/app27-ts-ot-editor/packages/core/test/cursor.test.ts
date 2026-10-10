import { describe, it, expect } from 'vitest';
import { targetLength, type Op } from '../src/ops';
import { transformIndex, transformSelection, transformCursors } from '../src/cursor';

describe('cursor', () => {
  /** @id TEST-CURSOR-001 @verifies REQ-CURSOR-001 */
  it('TEST-CURSOR-001 insert before shifts right', () => {
    expect(transformIndex(5, [2, 'abc', 8], 'before')).toBe(8);
    expect(transformIndex(5, [2, 'abc', 8], 'after')).toBe(8);
  });

  /** @id TEST-CURSOR-002 @verifies REQ-CURSOR-002 */
  it('TEST-CURSOR-002 insert at position honours bias', () => {
    const op: Op = [3, 'XY', 2];
    expect(transformIndex(3, op, 'after')).toBe(5);
    expect(transformIndex(3, op, 'before')).toBe(3);
    expect(transformIndex(0, ['Z', 5], 'before')).toBe(0);
    expect(transformIndex(5, [5, 'Z'], 'after')).toBe(6);
  });

  /** @id TEST-CURSOR-003 @verifies REQ-CURSOR-003 */
  it('TEST-CURSOR-003 delete before shifts left', () => {
    expect(transformIndex(6, [1, { d: 3 }, 4], 'before')).toBe(3);
    expect(transformIndex(4, [1, { d: 3 }, 4], 'after')).toBe(1);
  });

  /** @id TEST-CURSOR-004 @verifies REQ-CURSOR-004 */
  it('TEST-CURSOR-004 delete covering collapses to start', () => {
    expect(transformIndex(3, [2, { d: 4 }, 2], 'before')).toBe(2);
    expect(transformIndex(5, [2, { d: 4 }, 2], 'after')).toBe(2);
    expect(transformIndex(2, [2, { d: 4 }, 2], 'after')).toBe(2);
  });

  /** @id TEST-CURSOR-005 @verifies REQ-CURSOR-005 */
  it('TEST-CURSOR-005 range errors', () => {
    expect(() => transformIndex(-1, [3], 'before')).toThrow(RangeError);
    expect(() => transformIndex(1.5, [3], 'before')).toThrow(RangeError);
    expect(() => transformIndex(4, [3], 'before')).toThrow(RangeError);
    expect(transformIndex(3, [3], 'before')).toBe(3);
  });

  /** @id TEST-CURSOR-006 @verifies REQ-CURSOR-006 */
  it('TEST-CURSOR-006 selection keeps direction', () => {
    const op: Op = [1, 'ab', 5];
    expect(transformSelection({ anchor: 4, head: 2 }, op)).toEqual({ anchor: 6, head: 4 });
    expect(transformSelection({ anchor: 2, head: 4 }, op)).toEqual({ anchor: 4, head: 6 });
    expect(transformSelection({ anchor: 3, head: 3 }, [3, 'q', 3])).toEqual({ anchor: 3, head: 3 });
  });

  /** @id TEST-CURSOR-007 @verifies REQ-CURSOR-007 */
  it('TEST-CURSOR-007 selection collapses inside delete', () => {
    expect(transformSelection({ anchor: 3, head: 5 }, [1, { d: 6 }, 1])).toEqual({ anchor: 1, head: 1 });
    expect(transformSelection({ anchor: 5, head: 3 }, [1, { d: 6 }, 1])).toEqual({ anchor: 1, head: 1 });
  });

  /** @id TEST-CURSOR-008 @verifies REQ-CURSOR-008 */
  it('TEST-CURSOR-008 owner uses bias after', () => {
    const r = transformCursors({ me: 2, you: 2 }, [2, 'zz', 2], 'me');
    expect(r).toEqual({ me: 4, you: 2 });
  });

  /** @id TEST-CURSOR-009 @verifies REQ-CURSOR-009 */
  it('TEST-CURSOR-009 result stays inside target', () => {
    const ops: Op[] = [[3, 'a', { d: 2 }, 1], [{ d: 6 }], ['q', 6], [6, 'e'], [1, { d: 4 }, 'x', 1]];
    for (const op of ops) {
      for (let p = 0; p <= 6; p++) for (const bias of ['before', 'after'] as const) {
        const r = transformIndex(p, op, bias);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(targetLength(op));
      }
    }
  });
});
