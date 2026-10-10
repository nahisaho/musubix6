import { compose, transform, validate, type Op } from '@ot/core';
import type { Message } from './client';

export class QueueFullError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueueFullError';
  }
}
export class QueueCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueueCorruptError';
  }
}

export interface Entry { seq: number; baseRev: number; op: Op; count: number; inFlight: boolean }
export interface QueueOptions { maxCoalesce?: number; maxEntries?: number; baseRev?: number }

/** @id CODE-OFFLINE-001 @implements REQ-OFFLINE-009 */
export function backoffMs(attempt: number, base: number, cap: number): number {
  if (!Number.isInteger(attempt) || attempt < 0) throw new RangeError(`bad attempt ${attempt}`);
  return Math.min(cap, base * 2 ** Math.min(attempt, 52));
}

export class OfflineQueue {
  private list: Entry[] = [];
  private lastSeq = 0;
  private acked = 0;
  private revision: number;
  private readonly maxCoalesce: number;
  private readonly maxEntries: number;

  constructor(readonly clientId: string, opts: QueueOptions = {}) {
    this.maxCoalesce = opts.maxCoalesce ?? 10;
    this.maxEntries = opts.maxEntries ?? 100;
    this.revision = opts.baseRev ?? 0;
  }

  get size(): number { return this.list.length; }
  get rev(): number { return this.revision; }
  get entries(): readonly Entry[] { return this.list; }

  /** @id CODE-OFFLINE-002 @implements REQ-OFFLINE-001 REQ-OFFLINE-002 REQ-OFFLINE-003 REQ-OFFLINE-006 REQ-OFFLINE-011 */
  enqueue(op: Op): Entry {
    validate(op);
    const tail = this.list[this.list.length - 1];
    if (tail && !tail.inFlight && tail.count < this.maxCoalesce) {
      tail.op = compose(tail.op, op);
      tail.count++;
      return tail;
    }
    if (this.list.length >= this.maxEntries) throw new QueueFullError(`queue full (${this.maxEntries})`);
    const entry: Entry = { seq: ++this.lastSeq, baseRev: this.revision, op, count: 1, inFlight: false };
    this.list.push(entry);
    return entry;
  }

  /** @id CODE-OFFLINE-003 @implements REQ-OFFLINE-010 */
  next(): Message | null {
    const head = this.list[0];
    if (!head || head.inFlight) return null;
    head.inFlight = true;
    return { clientId: this.clientId, seq: head.seq, baseRev: this.revision, op: head.op };
  }

  /** @id CODE-OFFLINE-004 @implements REQ-OFFLINE-004 */
  ack(seq: number): void {
    if (seq <= this.acked) return;
    const head = this.list[0];
    if (!head || head.seq !== seq) throw new Error(`ack ${seq} is not the head of the queue`);
    this.list.shift();
    this.acked = seq;
    this.revision++;
  }

  /** @id CODE-OFFLINE-005 @implements REQ-OFFLINE-005 */
  rebase(serverOp: Op): Op {
    let s = serverOp;
    for (const e of this.list) [s, e.op] = transform(s, e.op);
    this.revision++;
    return s;
  }

  /** @id CODE-OFFLINE-006 @implements REQ-OFFLINE-007 */
  serialize(): string {
    return JSON.stringify({
      v: 1, clientId: this.clientId, rev: this.revision, lastSeq: this.lastSeq, acked: this.acked,
      maxCoalesce: this.maxCoalesce, maxEntries: this.maxEntries,
      entries: this.list.map((e) => ({ seq: e.seq, baseRev: e.baseRev, op: e.op, count: e.count })),
    });
  }

  /** @id CODE-OFFLINE-007 @implements REQ-OFFLINE-008 */
  static restore(json: string): OfflineQueue {
    let d: any;
    try { d = JSON.parse(json); } catch { throw new QueueCorruptError('invalid JSON'); }
    if (d === null || typeof d !== 'object' || d.v !== 1 || typeof d.clientId !== 'string' || !Array.isArray(d.entries)) throw new QueueCorruptError('bad header');
    if (![d.rev, d.lastSeq, d.acked, d.maxCoalesce, d.maxEntries].every((n) => Number.isInteger(n) && n >= 0)) throw new QueueCorruptError('bad counters');
    const q = new OfflineQueue(d.clientId, { maxCoalesce: d.maxCoalesce, maxEntries: d.maxEntries, baseRev: d.rev });
    q.lastSeq = d.lastSeq;
    q.acked = d.acked;
    let prev = d.acked;
    for (const e of d.entries) {
      try { validate(e.op); } catch { throw new QueueCorruptError('bad op'); }
      if (!Number.isInteger(e.seq) || e.seq <= prev || !Number.isInteger(e.count) || e.count < 1 || !Number.isInteger(e.baseRev)) throw new QueueCorruptError('bad entry');
      prev = e.seq;
      q.list.push({ seq: e.seq, baseRev: e.baseRev, op: e.op, count: e.count, inFlight: false });
    }
    if (prev > q.lastSeq) throw new QueueCorruptError('seq beyond lastSeq');
    return q;
  }
}
