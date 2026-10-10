import { describe, it, expect } from 'vitest';
import { apply } from '@ot/core';
import { OfflineQueue, QueueFullError, QueueCorruptError, backoffMs } from '../src/offline';

describe('offline', () => {
  /** @id TEST-OFFLINE-001 @verifies REQ-OFFLINE-001 */
  it('TEST-OFFLINE-001 enqueue assigns seq and base rev', () => {
    const q = new OfflineQueue('A', { baseRev: 3 });
    expect(q.enqueue(['x'])).toMatchObject({ seq: 1, baseRev: 3 });
    q.next();
    expect(q.enqueue([1, 'y'])).toMatchObject({ seq: 2, baseRev: 3 });
    expect(q.size).toBe(2);
  });

  /** @id TEST-OFFLINE-002 @verifies REQ-OFFLINE-002 */
  it('TEST-OFFLINE-002 unsent tail coalesces up to maxCoalesce', () => {
    const q = new OfflineQueue('A', { maxCoalesce: 2 });
    q.enqueue(['a']);
    q.enqueue([1, 'b']);
    expect(q.size).toBe(1);
    expect(q.entries[0].op).toEqual(['ab']);
    q.enqueue([2, 'c']);
    expect(q.size).toBe(2);
    expect(q.entries[1].seq).toBe(2);
  });

  /** @id TEST-OFFLINE-003 @verifies REQ-OFFLINE-003 */
  it('TEST-OFFLINE-003 in-flight tail is never merged', () => {
    const q = new OfflineQueue('A');
    q.enqueue(['a']);
    q.next();
    q.enqueue([1, 'b']);
    expect(q.size).toBe(2);
    expect(q.entries[0].op).toEqual(['a']);
  });

  /** @id TEST-OFFLINE-004 @verifies REQ-OFFLINE-004 */
  it('TEST-OFFLINE-004 ack removes head, repeats are ignored, non-head throws', () => {
    const q = new OfflineQueue('A', { maxCoalesce: 1 });
    q.enqueue(['a']);
    q.enqueue([1, 'b']);
    expect(() => q.ack(2)).toThrow(Error);
    q.next();
    q.ack(1);
    expect(q.size).toBe(1);
    q.ack(1);
    expect(q.size).toBe(1);
    expect(q.rev).toBe(1);
    expect(() => q.ack(9)).toThrow(Error);
  });

  /** @id TEST-OFFLINE-005 @verifies REQ-OFFLINE-005 */
  it('TEST-OFFLINE-005 rebase transforms every entry', () => {
    const q = new OfflineQueue('A', { maxCoalesce: 1 });
    q.enqueue(['X', 3]);
    q.enqueue([4, 'Y']);
    const s = q.rebase(['S', 3]);
    expect(q.rev).toBe(1);
    expect(q.entries.map((e) => e.op)).toEqual([[1, 'X', 3], [5, 'Y']]);
    expect(s).toEqual(['S', 5]);
    expect(apply('XabcY', s)).toBe('SXabcY');
  });

  /** @id TEST-OFFLINE-006 @verifies REQ-OFFLINE-006 */
  it('TEST-OFFLINE-006 full queue with in-flight tail refuses', () => {
    const q = new OfflineQueue('A', { maxEntries: 1 });
    q.enqueue(['a']);
    q.next();
    expect(() => q.enqueue([1, 'b'])).toThrow(QueueFullError);
    expect(q.size).toBe(1);
  });

  /** @id TEST-OFFLINE-007 @verifies REQ-OFFLINE-007 */
  it('TEST-OFFLINE-007 serialize/restore round trip', () => {
    const q = new OfflineQueue('A', { maxCoalesce: 1, baseRev: 2 });
    q.enqueue(['a']);
    q.enqueue([1, 'b']);
    q.next();
    q.ack(1);
    const r = OfflineQueue.restore(q.serialize());
    expect(r.serialize()).toBe(q.serialize());
    expect(r.entries.map((e) => [e.seq, e.op])).toEqual([[2, [1, 'b']]]);
    expect(r.enqueue([2, 'c']).seq).toBe(3);
  });

  /** @id TEST-OFFLINE-008 @verifies REQ-OFFLINE-008 */
  it('TEST-OFFLINE-008 restore rejects corrupt data', () => {
    const good = JSON.parse(new OfflineQueue('A').serialize());
    const bad = (m: object): string => JSON.stringify({ ...good, lastSeq: 9, ...m });
    const e = (seq: number) => ({ seq, baseRev: 0, op: ['a'], count: 1 });
    expect(() => OfflineQueue.restore('{nope')).toThrow(QueueCorruptError);
    expect(() => OfflineQueue.restore(bad({ v: 2 }))).toThrow(QueueCorruptError);
    expect(() => OfflineQueue.restore(bad({ entries: [e(2), e(2)] }))).toThrow(QueueCorruptError);
    expect(() => OfflineQueue.restore(bad({ entries: [e(3), e(2)] }))).toThrow(QueueCorruptError);
    expect(() => OfflineQueue.restore(bad({ entries: [{ seq: 1, baseRev: 0, op: [0], count: 1 }] }))).toThrow(QueueCorruptError);
    expect(() => OfflineQueue.restore(bad({ entries: 'x' }))).toThrow(QueueCorruptError);
    expect(() => OfflineQueue.restore(bad({ entries: [e(1)] }))).not.toThrow();
  });

  /** @id TEST-OFFLINE-009 @verifies REQ-OFFLINE-009 */
  it('TEST-OFFLINE-009 backoff', () => {
    expect([0, 1, 2, 3, 10].map((n) => backoffMs(n, 100, 1000))).toEqual([100, 200, 400, 800, 1000]);
    expect(() => backoffMs(-1, 100, 1000)).toThrow(RangeError);
    expect(() => backoffMs(1.5, 100, 1000)).toThrow(RangeError);
    expect(backoffMs(2000, 100, 1000)).toBe(1000);
  });

  /** @id TEST-OFFLINE-010 @verifies REQ-OFFLINE-010 */
  it('TEST-OFFLINE-010 next marks in flight', () => {
    const q = new OfflineQueue('A', { baseRev: 5 });
    expect(q.next()).toBeNull();
    q.enqueue(['a']);
    expect(q.next()).toEqual({ clientId: 'A', seq: 1, baseRev: 5, op: ['a'] });
    expect(q.next()).toBeNull();
    q.ack(1);
    expect(q.next()).toBeNull();
    q.enqueue(['z']);
    expect(q.next()!.baseRev).toBe(6);
  });

  /** @id TEST-OFFLINE-011 @verifies REQ-OFFLINE-011 */
  it('TEST-OFFLINE-011 size never exceeds maxEntries', () => {
    const q = new OfflineQueue('A', { maxEntries: 2, maxCoalesce: 1 });
    q.enqueue(['a']);
    q.enqueue([1, 'b']);
    expect(() => q.enqueue([2, 'c'])).toThrow(QueueFullError);
    expect(q.size).toBe(2);
    expect(q.entries.map((e) => e.seq)).toEqual([1, 2]);
  });
});
