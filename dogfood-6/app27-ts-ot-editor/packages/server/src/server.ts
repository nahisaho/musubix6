import { apply, baseLength, normalize, transform, validate, type Op } from '@ot/core';

export type RejectCode = 'bad-rev' | 'stale-rev' | 'bad-op' | 'bad-seq';
export interface Ack { rev: number; op: Op }
export interface Broadcast { rev: number; op: Op; origin: string; seq: number }

export class ServerError extends Error {
  constructor(public readonly code: RejectCode, message: string) {
    super(message);
    this.name = 'ServerError';
  }
}

interface ClientState { lastSeq: number; lastAck: Ack }

export class Server {
  private history: Op[] = [];
  private current: string;
  private readonly clients = new Map<string, ClientState>();
  private readonly listeners = new Set<(m: Broadcast) => void>();
  private floor = 0;

  constructor(doc: string) {
    this.current = doc;
  }

  get doc(): string { return this.current; }
  get rev(): number { return this.floor + this.history.length; }
  get minRev(): number { return this.floor; }

  private checkOp(op: Op, baseRev: number): Op[] {
    try {
      validate(op);
    } catch (e) {
      throw new ServerError('bad-op', (e as Error).message);
    }
    const concurrent = this.history.slice(baseRev - this.floor);
    const expected = concurrent.length > 0 ? baseLength(concurrent[0]) : this.current.length;
    if (baseLength(op) !== expected) throw new ServerError('bad-op', `op base ${baseLength(op)} != doc ${expected} at rev ${baseRev}`);
    return concurrent;
  }

  /** @id CODE-SERVER-001 @implements REQ-SERVER-002 REQ-SERVER-003 REQ-SERVER-004 REQ-SERVER-005 REQ-SERVER-006 REQ-SERVER-007 REQ-SERVER-008 REQ-SERVER-011 REQ-SERVER-012 REQ-SERVER-013 */
  receive(clientId: string, seq: number, baseRev: number, op: Op): Ack {
    const st = this.clients.get(clientId);
    const last = st?.lastSeq ?? 0;
    if (st && seq === last) return st.lastAck;
    if (!Number.isInteger(baseRev) || baseRev < 0 || baseRev > this.rev) throw new ServerError('bad-rev', `baseRev ${baseRev} not in [0, ${this.rev}]`);
    if (baseRev < this.floor) throw new ServerError('stale-rev', `baseRev ${baseRev} < minRev ${this.floor}`);
    if (seq !== last + 1) throw new ServerError('bad-seq', `seq ${seq} after ${last}`);
    const concurrent = this.checkOp(op, baseRev);
    let out = normalize(op);
    for (const h of concurrent) out = transform(h, out)[1];
    this.current = apply(this.current, out);
    this.history.push(out);
    const ack: Ack = { rev: this.rev, op: out };
    this.clients.set(clientId, { lastSeq: seq, lastAck: ack });
    for (const l of this.listeners) l({ rev: ack.rev, op: out, origin: clientId, seq });
    return ack;
  }

  /** @id CODE-SERVER-002 @implements REQ-SERVER-009 */
  compact(minRev: number): void {
    if (!Number.isInteger(minRev) || minRev < 0 || minRev > this.rev) throw new RangeError(`minRev ${minRev} out of range`);
    if (minRev <= this.floor) return;
    this.history = this.history.slice(minRev - this.floor);
    this.floor = minRev;
  }

  /** @id CODE-SERVER-003 @implements REQ-SERVER-010 */
  opsSince(rev: number): Op[] {
    if (!Number.isInteger(rev) || rev < this.floor || rev > this.rev) throw new RangeError(`rev ${rev} not in [${this.floor}, ${this.rev}]`);
    return this.history.slice(rev - this.floor);
  }

  /** @id CODE-SERVER-004 @implements REQ-SERVER-011 */
  subscribe(fn: (m: Broadcast) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
}
