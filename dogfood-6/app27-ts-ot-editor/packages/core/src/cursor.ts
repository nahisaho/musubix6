import { baseLength, normalize, type Op } from './ops';

export type Bias = 'before' | 'after';
export interface Selection { anchor: number; head: number }

/** @id CODE-CURSOR-001 @implements REQ-CURSOR-001 REQ-CURSOR-002 REQ-CURSOR-003 REQ-CURSOR-004 REQ-CURSOR-005 REQ-CURSOR-009 */
export function transformIndex(pos: number, op: Op, bias: Bias = 'before'): number {
  if (!Number.isInteger(pos) || pos < 0 || pos > baseLength(op)) throw new RangeError(`position ${pos} out of range`);
  let oldPos = 0;
  let newPos = 0;
  for (const c of normalize(op)) {
    if (typeof c === 'number') {
      if (pos < oldPos + c) return newPos + (pos - oldPos);
      oldPos += c;
      newPos += c;
    } else if (typeof c === 'string') {
      if (oldPos === pos && bias === 'before') return newPos;
      newPos += c.length;
    } else {
      if (pos < oldPos + c.d) return newPos;
      oldPos += c.d;
    }
  }
  return newPos;
}

/** @id CODE-CURSOR-002 @implements REQ-CURSOR-006 REQ-CURSOR-007 */
export function transformSelection(sel: Selection, op: Op, bias: Bias = 'before'): Selection {
  return { anchor: transformIndex(sel.anchor, op, bias), head: transformIndex(sel.head, op, bias) };
}

/** @id CODE-CURSOR-003 @implements REQ-CURSOR-008 */
export function transformCursors(cursors: Record<string, number>, op: Op, owner: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, pos] of Object.entries(cursors)) out[id] = transformIndex(pos, op, id === owner ? 'after' : 'before');
  return out;
}
