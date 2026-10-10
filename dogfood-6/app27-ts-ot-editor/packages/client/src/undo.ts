import { compose, invert, isNoop, transform, type Op } from '@ot/core';

export interface RecordOptions { merge?: boolean }

function rebase(stack: Op[], remote: Op): Op[] {
  const kept: Op[] = [];
  let r = remote;
  for (let i = stack.length - 1; i >= 0; i--) {
    const [e, r2] = transform(stack[i], r);
    r = r2;
    if (!isNoop(e)) kept.push(e);
  }
  return kept.reverse();
}

export class UndoManager {
  private undoStack: Op[] = [];
  private redoStack: Op[] = [];

  constructor(private readonly capacity = 100) {}

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  /** @id CODE-UNDO-001 @implements REQ-UNDO-001 REQ-UNDO-007 REQ-UNDO-008 */
  record(op: Op, docBefore: string, opts: RecordOptions = {}): void {
    const inv = invert(op, docBefore);
    if (isNoop(inv)) return;
    this.redoStack = [];
    if (opts.merge && this.undoStack.length > 0) {
      const top = this.undoStack.length - 1;
      this.undoStack[top] = compose(inv, this.undoStack[top]);
    } else {
      this.undoStack.push(inv);
      if (this.undoStack.length > this.capacity) this.undoStack.shift();
    }
  }

  /** @id CODE-UNDO-002 @implements REQ-UNDO-002 REQ-UNDO-003 */
  undo(doc: string): Op | null {
    const op = this.undoStack.pop();
    if (op === undefined) return null;
    this.redoStack.push(invert(op, doc));
    return op;
  }

  /** @id CODE-UNDO-003 @implements REQ-UNDO-004 REQ-UNDO-003 */
  redo(doc: string): Op | null {
    const op = this.redoStack.pop();
    if (op === undefined) return null;
    this.undoStack.push(invert(op, doc));
    return op;
  }

  /** @id CODE-UNDO-004 @implements REQ-UNDO-005 REQ-UNDO-006 REQ-UNDO-009 */
  remote(op: Op): void {
    this.undoStack = rebase(this.undoStack, op);
    this.redoStack = rebase(this.redoStack, op);
  }

  /** @id CODE-UNDO-005 @implements REQ-UNDO-010 */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
