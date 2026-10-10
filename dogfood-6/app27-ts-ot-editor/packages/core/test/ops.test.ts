import { describe, it, expect } from 'vitest';
import { apply, baseLength, compose, invert, isNoop, normalize, OpError, targetLength, transform, validate, type Op } from '../src/ops';

function allOps(n: number, maxIns = 2): Op[] {
  const out = new Map<string, Op>();
  const go = (rem: number, ins: number, acc: Op): void => {
    if (rem === 0 && ins >= 0) { const o = normalize(acc); out.set(JSON.stringify(o), o); }
    if (ins < maxIns) go(rem, ins + 1, [...acc, ins % 2 ? 'Y' : 'X']);
    for (let k = 1; k <= rem; k++) { go(rem - k, ins, [...acc, k]); go(rem - k, ins, [...acc, { d: k }]); }
  };
  go(n, 0, []);
  return [...out.values()];
}

describe('ops', () => {
  /** @id TEST-OPS-001 @verifies REQ-OPS-001 */
  it('TEST-OPS-001 lengths', () => {
    const op: Op = [2, 'abc', { d: 4 }, 1];
    expect(baseLength(op)).toBe(7);
    expect(targetLength(op)).toBe(6);
    expect(baseLength([])).toBe(0);
  });

  /** @id TEST-OPS-002 @verifies REQ-OPS-002 */
  it('TEST-OPS-002 validate rejects malformed components', () => {
    for (const bad of [[0], [-1], [1.5], [''], [{ d: 0 }], [{ d: 1.2 }], [{ x: 1 }], [null], [true]] as unknown[][]) {
      expect(() => validate(bad as Op)).toThrow(OpError);
    }
    expect(() => validate([1, 'a', { d: 2 }])).not.toThrow();
    expect(() => validate('x' as unknown as Op)).toThrow(OpError);
  });

  /** @id TEST-OPS-003 @verifies REQ-OPS-003 */
  it('TEST-OPS-003 normalize merges and orders', () => {
    expect(normalize([1, 2, 'a', 'b', { d: 1 }, { d: 2 }])).toEqual([3, 'ab', { d: 3 }]);
    expect(normalize([{ d: 2 }, 'x'])).toEqual(['x', { d: 2 }]);
    expect(normalize([{ d: 1 }, 'a', { d: 1 }, 'b'])).toEqual(['ab', { d: 2 }]);
    expect(normalize([0, '', { d: 0 }, 2])).toEqual([2]);
  });

  /** @id TEST-OPS-004 @verifies REQ-OPS-004 */
  it('TEST-OPS-004 apply', () => {
    expect(apply('hello', [1, { d: 2 }, 'XY', 2])).toBe('hXYlo');
    expect(apply('', ['abc'])).toBe('abc');
    expect(apply('ab', [{ d: 2 }])).toBe('');
  });

  /** @id TEST-OPS-005 @verifies REQ-OPS-005 */
  it('TEST-OPS-005 apply length mismatch', () => {
    expect(() => apply('abc', [2])).toThrow(OpError);
    expect(() => apply('abc', [4])).toThrow(OpError);
    expect(() => apply('', [{ d: 1 }])).toThrow(OpError);
  });

  /** @id TEST-OPS-006 @verifies REQ-OPS-006 */
  it('TEST-OPS-006 compose equals sequential apply', () => {
    for (const n of [0, 1, 2, 3]) {
      const doc = 'abc'.slice(0, n);
      for (const a of allOps(n)) {
        const mid = apply(doc, a);
        for (const b of allOps(mid.length, 1)) {
          expect(apply(doc, compose(a, b))).toBe(apply(mid, b));
        }
      }
    }
  });

  /** @id TEST-OPS-007 @verifies REQ-OPS-007 */
  it('TEST-OPS-007 compose length mismatch', () => {
    expect(() => compose([3], [2])).toThrow(OpError);
    expect(() => compose(['ab'], [1])).toThrow(OpError);
  });

  /** @id TEST-OPS-008 @verifies REQ-OPS-008 */
  it('TEST-OPS-008 transform converges (exhaustive small docs)', () => {
    let pairs = 0;
    for (const n of [0, 1, 2, 3]) {
      const doc = 'abc'.slice(0, n);
      const ops = allOps(n);
      for (const a of ops) for (const b of ops) {
        const [a2, b2] = transform(a, b);
        expect(apply(apply(doc, a), b2)).toBe(apply(apply(doc, b), a2));
        pairs++;
      }
    }
    expect(pairs).toBeGreaterThan(500);
  });

  /** @id TEST-OPS-009 @verifies REQ-OPS-009 */
  it('TEST-OPS-009 first argument wins insert ties', () => {
    const [a2, b2] = transform(['A', 2], ['B', 2]);
    expect(apply(apply('xy', ['A', 2]), b2)).toBe('ABxy');
    expect(apply(apply('xy', ['B', 2]), a2)).toBe('ABxy');
  });

  /** @id TEST-OPS-010 @verifies REQ-OPS-010 */
  it('TEST-OPS-010 transform base length mismatch', () => {
    expect(() => transform([1], [2])).toThrow(OpError);
  });

  /** @id TEST-OPS-011 @verifies REQ-OPS-011 */
  it('TEST-OPS-011 invert restores the document', () => {
    for (const n of [0, 1, 2, 3]) {
      const doc = 'abc'.slice(0, n);
      for (const op of allOps(n)) {
        const inv = invert(op, doc);
        expect(apply(apply(doc, op), inv)).toBe(doc);
        expect(baseLength(inv)).toBe(targetLength(op));
      }
    }
  });

  /** @id TEST-OPS-012 @verifies REQ-OPS-012 */
  it('TEST-OPS-012 isNoop', () => {
    expect(isNoop([3])).toBe(true);
    expect(isNoop([])).toBe(true);
    expect(isNoop([1, 'a'])).toBe(false);
    expect(isNoop([{ d: 1 }])).toBe(false);
  });
});
