import { describe, it, expect } from 'vitest';
import { apply, type Op } from '@ot/core';
import { Server, ServerError } from '../src/server';

const code = (f: () => unknown): string | undefined => {
  try { f(); } catch (e) { return e instanceof ServerError ? e.code : `other:${String(e)}`; }
  return undefined;
};

describe('server', () => {
  /** @id TEST-SERVER-001 @verifies REQ-SERVER-001 */
  it('TEST-SERVER-001 initial state', () => {
    const s = new Server('abc');
    expect(s.doc).toBe('abc');
    expect(s.rev).toBe(0);
    expect(s.minRev).toBe(0);
    expect(s.opsSince(0)).toEqual([]);
  });

  /** @id TEST-SERVER-002 @verifies REQ-SERVER-002 */
  it('TEST-SERVER-002 sequential receive', () => {
    const s = new Server('abc');
    expect(s.receive('A', 1, 0, ['X', 3])).toEqual({ rev: 1, op: ['X', 3] });
    expect(s.receive('A', 2, 1, [4, 'Z'])).toEqual({ rev: 2, op: [4, 'Z'] });
    expect(s.doc).toBe('XabcZ');
  });

  /** @id TEST-SERVER-003 @verifies REQ-SERVER-003 */
  it('TEST-SERVER-003 concurrent op is transformed, history wins ties', () => {
    const s = new Server('abc');
    s.receive('A', 1, 0, ['X', 3]);
    const ack = s.receive('B', 1, 0, ['Y', 3]);
    expect(ack).toEqual({ rev: 2, op: [1, 'Y', 3] });
    expect(s.doc).toBe('XYabc');
    s.receive('C', 1, 0, [{ d: 3 }]);
    expect(s.doc).toBe('XY');
  });

  /** @id TEST-SERVER-004 @verifies REQ-SERVER-004 */
  it('TEST-SERVER-004 bad rev', () => {
    const s = new Server('ab');
    expect(code(() => s.receive('A', 1, 1, [2]))).toBe('bad-rev');
    expect(code(() => s.receive('A', 1, -1, [2]))).toBe('bad-rev');
    expect(code(() => s.receive('A', 1, 0.5, [2]))).toBe('bad-rev');
    expect(s.rev).toBe(0);
  });

  /** @id TEST-SERVER-005 @verifies REQ-SERVER-005 */
  it('TEST-SERVER-005 stale rev after compaction', () => {
    const s = new Server('ab');
    s.receive('A', 1, 0, ['x', 2]);
    s.receive('A', 2, 1, ['y', 3]);
    s.compact(2);
    expect(code(() => s.receive('B', 1, 1, [4]))).toBe('stale-rev');
    expect(s.receive('B', 1, 2, [4, 'z']).rev).toBe(3);
  });

  /** @id TEST-SERVER-006 @verifies REQ-SERVER-006 */
  it('TEST-SERVER-006 bad op leaves state unchanged', () => {
    const s = new Server('ab');
    s.receive('A', 1, 0, ['x', 2]);
    expect(code(() => s.receive('B', 1, 0, [5]))).toBe('bad-op');
    expect(code(() => s.receive('B', 1, 0, [0, 2]))).toBe('bad-op');
    expect(code(() => s.receive('B', 1, 1, [2]))).toBe('bad-op');
    expect(s.doc).toBe('xab');
    expect(s.rev).toBe(1);
    expect(s.receive('B', 1, 0, [2, 'q']).rev).toBe(2);
  });

  /** @id TEST-SERVER-007 @verifies REQ-SERVER-007 */
  it('TEST-SERVER-007 duplicate returns cached ack', () => {
    const s = new Server('ab');
    const a1 = s.receive('A', 1, 0, ['x', 2]);
    s.receive('B', 1, 1, [3, 'y']);
    const a2 = s.receive('A', 1, 0, ['x', 2]);
    expect(a2).toEqual(a1);
    expect(s.rev).toBe(2);
    expect(s.doc).toBe('xaby');
  });

  /** @id TEST-SERVER-008 @verifies REQ-SERVER-008 */
  it('TEST-SERVER-008 bad seq', () => {
    const s = new Server('ab');
    expect(code(() => s.receive('A', 2, 0, [2]))).toBe('bad-seq');
    s.receive('A', 1, 0, [2, 'a']);
    s.receive('A', 2, 1, [3, 'b']);
    expect(code(() => s.receive('A', 1, 0, [2, 'a']))).toBe('bad-seq');
    expect(code(() => s.receive('A', 4, 2, [4]))).toBe('bad-seq');
    expect(s.rev).toBe(2);
  });

  /** @id TEST-SERVER-009 @verifies REQ-SERVER-009 */
  it('TEST-SERVER-009 compact', () => {
    const s = new Server('');
    s.receive('A', 1, 0, ['a']);
    s.receive('A', 2, 1, [1, 'b']);
    s.compact(1);
    expect(s.minRev).toBe(1);
    expect(s.opsSince(1)).toEqual([[1, 'b']]);
    expect(() => s.compact(3)).toThrow(RangeError);
    s.compact(0);
    expect(s.minRev).toBe(1);
    s.compact(2);
    expect(s.opsSince(2)).toEqual([]);
  });

  /** @id TEST-SERVER-010 @verifies REQ-SERVER-010 */
  it('TEST-SERVER-010 opsSince', () => {
    const s = new Server('');
    s.receive('A', 1, 0, ['a']);
    s.receive('A', 2, 1, [1, 'b']);
    const ops: Op[] = s.opsSince(0);
    expect(ops).toHaveLength(2);
    expect(ops.reduce((d, o) => apply(d, o), '')).toBe('ab');
    expect(() => s.opsSince(3)).toThrow(RangeError);
    s.compact(1);
    expect(() => s.opsSince(0)).toThrow(RangeError);
  });

  /** @id TEST-SERVER-011 @verifies REQ-SERVER-011 */
  it('TEST-SERVER-011 subscribers notified once per accepted op', () => {
    const s = new Server('ab');
    const seen: unknown[] = [];
    const un = s.subscribe((m) => seen.push(m));
    s.receive('A', 1, 0, ['x', 2]);
    s.receive('A', 1, 0, ['x', 2]);
    try { s.receive('B', 1, 0, [9]); } catch { /* rejected */ }
    expect(seen).toEqual([{ rev: 1, op: ['x', 2], origin: 'A', seq: 1 }]);
    un();
    s.receive('A', 2, 1, [3, 'q']);
    expect(seen).toHaveLength(1);
  });

  /** @id TEST-SERVER-012 @verifies REQ-SERVER-012 */
  it('TEST-SERVER-012 no-op still consumes a revision', () => {
    const s = new Server('abc');
    s.receive('A', 1, 0, [{ d: 1 }, 2]);
    const ack = s.receive('B', 1, 0, [{ d: 1 }, 2]);
    expect(ack).toEqual({ rev: 2, op: [2] });
    expect(s.rev).toBe(2);
    expect(s.doc).toBe('bc');
  });
});

describe('server bug fixes', () => {
  /** @id TEST-SERVER-013 @verifies REQ-SERVER-013 */
  it('TEST-SERVER-013 duplicate after compaction still gets the cached ack', () => {
    const s = new Server('ab');
    const a1 = s.receive('A', 1, 0, ['x', 2]);
    s.receive('B', 1, 1, [3, 'y']);
    s.compact(2);
    expect(s.receive('A', 1, 0, ['x', 2])).toEqual(a1);
    expect(s.rev).toBe(2);
  });
});
