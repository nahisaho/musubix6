export function validTime(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('invalid logical time');
}
/** @id CODE-TIMERS-001 @implements REQ-TIMERS-001 REQ-TIMERS-002 REQ-TIMERS-003 */
export class LogicalClock {
  private value: number;
  constructor(initial = 0) { validTime(initial); this.value = initial; }
  get now(): number { return this.value; }
  advanceTo(next: number): void {
    validTime(next);
    if (next < this.value) throw new TypeError('logical time cannot move backwards');
    this.value = next;
  }
}
export interface Timer { runId: string; key: string; due: number }
const identity = (runId: string, key: string) => JSON.stringify([runId, key]);
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const compareTimers = (a: Timer, b: Timer) => a.due - b.due || compareText(a.runId, b.runId) || compareText(a.key, b.key);
/** @id CODE-TIMERS-002 @implements REQ-TIMERS-004 REQ-TIMERS-005 REQ-TIMERS-006 REQ-TIMERS-007 REQ-TIMERS-008 REQ-TIMERS-009 REQ-TIMERS-010 */
export class TimerQueue {
  private timers = new Map<string, Timer>();
  schedule(runId: string, key: string, due: number): void {
    validTime(due);
    if (typeof runId !== 'string' || !runId.length || typeof key !== 'string' || !key.length) throw new TypeError('invalid timer identifier');
    const id = identity(runId, key); const previous = this.timers.get(id);
    if (previous && previous.due !== due) throw new Error('timer deadline conflict');
    this.timers.set(id, { runId, key, due });
  }
  drain(now: number): Timer[] {
    validTime(now);
    const due = this.snapshot().filter(t => t.due <= now);
    for (const t of due) this.timers.delete(identity(t.runId, t.key));
    return due;
  }
  cancel(runId: string, key: string): boolean { return this.timers.delete(identity(runId, key)); }
  snapshot(): Timer[] { return [...this.timers.values()].map(t => ({ ...t })).sort(compareTimers); }
  static restore(snapshot: Timer[]): TimerQueue {
    if (!Array.isArray(snapshot)) throw new TypeError('invalid timer snapshot');
    const q = new TimerQueue();
    for (const t of snapshot) {
      if (!t || typeof t !== 'object') throw new TypeError('invalid timer snapshot');
      q.schedule(t.runId, t.key, t.due);
    }
    return q;
  }
}
