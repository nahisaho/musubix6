import { apply, baseLength, compose, transform, validate, OpError, type Op } from '@ot/core';

export interface Message { clientId: string; seq: number; baseRev: number; op: Op }
export type ClientState = 'synchronized' | 'awaiting' | 'buffering';

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

export class Client {
  private text: string;
  private revision: number;
  private seq = 0;
  private outstanding: Op | null = null;
  private buffer: Op | null = null;

  constructor(readonly clientId: string, doc: string, rev: number, private readonly send: (m: Message) => void) {
    this.text = doc;
    this.revision = rev;
  }

  get doc(): string { return this.text; }
  get rev(): number { return this.revision; }
  get state(): ClientState {
    return this.outstanding === null ? 'synchronized' : this.buffer === null ? 'awaiting' : 'buffering';
  }
  get pending(): { outstanding: Op | null; buffer: Op | null } {
    return { outstanding: this.outstanding, buffer: this.buffer };
  }

  private emit(op: Op): void {
    this.outstanding = op;
    this.send({ clientId: this.clientId, seq: ++this.seq, baseRev: this.revision, op });
  }

  /** @id CODE-CLIENT-001 @implements REQ-CLIENT-001 REQ-CLIENT-002 REQ-CLIENT-003 REQ-CLIENT-011 */
  local(op: Op): void {
    validate(op);
    if (baseLength(op) !== this.text.length) throw new OpError(`local op base ${baseLength(op)} != doc ${this.text.length}`);
    const next = apply(this.text, op);
    if (this.outstanding === null) {
      this.text = next;
      this.emit(op);
    } else {
      this.buffer = this.buffer === null ? op : compose(this.buffer, op);
      this.text = next;
    }
  }

  /** @id CODE-CLIENT-002 @implements REQ-CLIENT-004 REQ-CLIENT-005 REQ-CLIENT-009 REQ-CLIENT-010 */
  ack(): void {
    if (this.outstanding === null) throw new ProtocolError('ack while synchronized');
    this.revision++;
    const buffered = this.buffer;
    this.outstanding = null;
    this.buffer = null;
    if (buffered !== null) this.emit(buffered);
  }

  /** @id CODE-CLIENT-003 @implements REQ-CLIENT-006 REQ-CLIENT-007 REQ-CLIENT-008 REQ-CLIENT-011 */
  serverOp(op: Op): void {
    validate(op);
    let toApply = op;
    let outstanding = this.outstanding;
    let buffer = this.buffer;
    if (outstanding === null) {
      if (baseLength(op) !== this.text.length) throw new OpError('server op base length mismatch');
    } else {
      [toApply, outstanding] = transform(toApply, outstanding);
      if (buffer !== null) [toApply, buffer] = transform(toApply, buffer);
    }
    this.text = apply(this.text, toApply);
    this.outstanding = outstanding;
    this.buffer = buffer;
    this.revision++;
  }
}
