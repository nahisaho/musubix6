import { describe, it, expect } from 'vitest';
import { apply } from '@ot/core';
import { UndoManager } from '../src/undo';

describe('undo', () => {
  /** @id TEST-UNDO-001 @verifies REQ-UNDO-001 */
  it('TEST-UNDO-001 record pushes the inverse and clears redo', () => {
    const u = new UndoManager();
    u.record(['X', 3], 'abc');
    expect(u.canUndo).toBe(true);
    u.undo('Xabc');
    expect(u.canRedo).toBe(true);
    u.record(['Q', 3], 'abc');
    expect(u.canRedo).toBe(false);
    expect(u.undo('Qabc')).toEqual([{ d: 1 }, 3]);
  });

  /** @id TEST-UNDO-002 @verifies REQ-UNDO-002 */
  it('TEST-UNDO-002 undo returns the inverse', () => {
    const u = new UndoManager();
    u.record([1, { d: 1 }, 1], 'abc');
    const inv = u.undo('ac')!;
    expect(inv).toEqual([1, 'b', 1]);
    expect(apply('ac', inv)).toBe('abc');
    expect(u.canUndo).toBe(false);
    expect(u.canRedo).toBe(true);
  });

  /** @id TEST-UNDO-003 @verifies REQ-UNDO-003 */
  it('TEST-UNDO-003 empty stacks return null', () => {
    const u = new UndoManager();
    expect(u.undo('abc')).toBeNull();
    expect(u.redo('abc')).toBeNull();
  });

  /** @id TEST-UNDO-004 @verifies REQ-UNDO-004 */
  it('TEST-UNDO-004 redo re-applies', () => {
    const u = new UndoManager();
    u.record(['X', 3], 'abc');
    const back = u.undo('Xabc')!;
    expect(apply('Xabc', back)).toBe('abc');
    const again = u.redo('abc')!;
    expect(apply('abc', again)).toBe('Xabc');
    expect(u.canUndo).toBe(true);
    expect(u.canRedo).toBe(false);
  });

  /** @id TEST-UNDO-005 @verifies REQ-UNDO-005 */
  it('TEST-UNDO-005 remote op transforms the undo stack', () => {
    const u = new UndoManager();
    u.record(['X', 3], 'abc');
    u.remote([4, 'R']);
    const inv = u.undo('XabcR')!;
    expect(apply('XabcR', inv)).toBe('abcR');
    const u2 = new UndoManager();
    u2.record([3, 'Z'], 'abc');
    u2.record(['Y', 4], 'abcZ');
    u2.remote(['R', 5]);
    expect(apply('RYabcZ', u2.undo('RYabcZ')!)).toBe('RabcZ');
    expect(apply('RabcZ', u2.undo('RabcZ')!)).toBe('Rabc');
  });

  /** @id TEST-UNDO-006 @verifies REQ-UNDO-006 */
  it('TEST-UNDO-006 entries that become no-ops are dropped', () => {
    const u = new UndoManager();
    u.record(['X', 3], 'abc');
    u.remote([{ d: 1 }, 3]);
    expect(u.canUndo).toBe(false);
    expect(u.undo('abc')).toBeNull();
  });

  /** @id TEST-UNDO-007 @verifies REQ-UNDO-007 */
  it('TEST-UNDO-007 merge coalesces typing', () => {
    const u = new UndoManager();
    u.record(['a'], '');
    u.record([1, 'b'], 'a', { merge: true });
    u.record([2, 'c'], 'ab', { merge: true });
    expect(u.undo('abc')).toEqual([{ d: 3 }]);
    expect(u.canUndo).toBe(false);
    u.redo('');
    u.record(['z', 3], 'abc');
    u.record(['y', 4], 'zabc', { merge: false });
    expect(u.undo('yzabc')).toEqual([{ d: 1 }, 4]);
  });

  /** @id TEST-UNDO-008 @verifies REQ-UNDO-008 */
  it('TEST-UNDO-008 capacity drops the oldest', () => {
    const u = new UndoManager(2);
    u.record(['a'], '');
    u.record([1, 'b'], 'a');
    u.record([2, 'c'], 'ab');
    expect(u.undo('abc')).not.toBeNull();
    expect(u.undo('ab')).not.toBeNull();
    expect(u.undo('a')).toBeNull();
  });

  /** @id TEST-UNDO-009 @verifies REQ-UNDO-009 */
  it('TEST-UNDO-009 redo stack follows remote ops', () => {
    const u = new UndoManager();
    u.record(['X', 3], 'abc');
    u.undo('Xabc');
    u.remote([3, 'R']);
    const redo = u.redo('abcR')!;
    expect(apply('abcR', redo)).toBe('XabcR');
  });

  /** @id TEST-UNDO-010 @verifies REQ-UNDO-010 */
  it('TEST-UNDO-010 canUndo/canRedo/clear', () => {
    const u = new UndoManager();
    expect([u.canUndo, u.canRedo]).toEqual([false, false]);
    u.record(['X', 3], 'abc');
    u.undo('Xabc');
    u.record(['Y', 3], 'abc');
    u.undo('Yabc');
    expect([u.canUndo, u.canRedo]).toEqual([false, true]);
    u.clear();
    expect([u.canUndo, u.canRedo]).toEqual([false, false]);
  });
});
