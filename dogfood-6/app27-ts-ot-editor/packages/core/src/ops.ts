export type Component = number | string | { d: number };
export type Op = Component[];

export class OpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpError';
  }
}

const isRetain = (c: Component): c is number => typeof c === 'number';
const isInsert = (c: Component): c is string => typeof c === 'string';
const isDelete = (c: Component): c is { d: number } => typeof c === 'object';
const len = (c: Component): number => (isRetain(c) ? c : isInsert(c) ? c.length : c.d);

/** @id CODE-OPS-001 @implements REQ-OPS-002 */
export function validate(op: Op): void {
  if (!Array.isArray(op)) throw new OpError('op must be an array');
  for (const c of op) {
    if (typeof c === 'number') {
      if (!Number.isInteger(c) || c <= 0) throw new OpError(`bad retain ${c}`);
    } else if (typeof c === 'string') {
      if (c.length === 0) throw new OpError('empty insert');
    } else if (c !== null && typeof c === 'object' && Object.keys(c).length === 1 && 'd' in c) {
      if (!Number.isInteger(c.d) || c.d <= 0) throw new OpError(`bad delete ${c.d}`);
    } else {
      throw new OpError('unknown component');
    }
  }
}

/** @id CODE-OPS-002 @implements REQ-OPS-001 */
export function baseLength(op: Op): number {
  let n = 0;
  for (const c of op) if (!isInsert(c)) n += len(c);
  return n;
}

/** @id CODE-OPS-003 @implements REQ-OPS-001 */
export function targetLength(op: Op): number {
  let n = 0;
  for (const c of op) if (!isDelete(c)) n += len(c);
  return n;
}

/** @id CODE-OPS-004 @implements REQ-OPS-003 */
export function normalize(op: Op): Op {
  const out: Op = [];
  let ins = '';
  let del = 0;
  const flush = (): void => {
    if (ins) out.push(ins);
    if (del) out.push({ d: del });
    ins = '';
    del = 0;
  };
  for (const c of op) {
    if (isInsert(c)) ins += c;
    else if (isDelete(c)) del += c.d;
    else if (c > 0) {
      flush();
      const last = out[out.length - 1];
      if (typeof last === 'number') out[out.length - 1] = last + c;
      else out.push(c);
    }
  }
  flush();
  return out;
}

/** @id CODE-OPS-005 @implements REQ-OPS-004 REQ-OPS-005 */
export function apply(doc: string, op: Op): string {
  validate(op);
  if (baseLength(op) !== doc.length) throw new OpError(`base length ${baseLength(op)} != doc length ${doc.length}`);
  let pos = 0;
  let out = '';
  for (const c of op) {
    if (isRetain(c)) { out += doc.slice(pos, pos + c); pos += c; }
    else if (isInsert(c)) out += c;
    else pos += c.d;
  }
  return out;
}

class Reader {
  private i = 0;
  private cur: Component | undefined;

  constructor(private readonly ops: Op) {
    this.cur = ops[0];
  }

  peek(): Component | undefined { return this.cur; }

  // takes n units (default: all) of the current component and moves on when it is used up
  take(n?: number): Component {
    const c = this.cur as Component;
    const size = len(c);
    const m = n ?? size;
    if (m < size) {
      this.cur = isRetain(c) ? c - m : isInsert(c) ? c.slice(m) : { d: c.d - m };
      return isRetain(c) ? m : isInsert(c) ? c.slice(0, m) : { d: m };
    }
    this.cur = this.ops[++this.i];
    return c;
  }
}

/** @id CODE-OPS-006 @implements REQ-OPS-006 REQ-OPS-007 */
export function compose(a: Op, b: Op): Op {
  validate(a);
  validate(b);
  if (targetLength(a) !== baseLength(b)) throw new OpError('compose length mismatch');
  const ra = new Reader(normalize(a));
  const rb = new Reader(normalize(b));
  const out: Op = [];
  for (;;) {
    const ca = ra.peek();
    const cb = rb.peek();
    if (ca === undefined && cb === undefined) break;
    if (ca !== undefined && isDelete(ca)) { out.push(ra.take()); continue; }
    if (cb !== undefined && isInsert(cb)) { out.push(rb.take()); continue; }
    if (ca === undefined || cb === undefined) throw new OpError('compose length mismatch');
    const m = Math.min(len(ca), len(cb));
    const pa = ra.take(m);
    const pb = rb.take(m);
    if (isRetain(pa)) out.push(isRetain(pb) ? m : { d: m });
    else if (isRetain(pb)) out.push(pa);
  }
  return normalize(out);
}

/** @id CODE-OPS-007 @implements REQ-OPS-008 REQ-OPS-009 REQ-OPS-010 */
export function transform(a: Op, b: Op): [Op, Op] {
  validate(a);
  validate(b);
  if (baseLength(a) !== baseLength(b)) throw new OpError('transform base length mismatch');
  const ra = new Reader(normalize(a));
  const rb = new Reader(normalize(b));
  const a2: Op = [];
  const b2: Op = [];
  for (;;) {
    const ca = ra.peek();
    const cb = rb.peek();
    if (ca === undefined && cb === undefined) break;
    if (ca !== undefined && isInsert(ca)) { a2.push(ra.take()); b2.push(ca.length); continue; }
    if (cb !== undefined && isInsert(cb)) { a2.push(cb.length); b2.push(rb.take()); continue; }
    if (ca === undefined || cb === undefined) throw new OpError('transform base length mismatch');
    const m = Math.min(len(ca), len(cb));
    const pa = ra.take(m);
    const pb = rb.take(m);
    if (isRetain(pa) && isRetain(pb)) { a2.push(m); b2.push(m); }
    else if (isDelete(pa) && isRetain(pb)) a2.push(pa);
    else if (isRetain(pa) && isDelete(pb)) b2.push(pb);
  }
  return [normalize(a2), normalize(b2)];
}

/** @id CODE-OPS-008 @implements REQ-OPS-011 */
export function invert(op: Op, doc: string): Op {
  validate(op);
  if (baseLength(op) !== doc.length) throw new OpError('invert length mismatch');
  let pos = 0;
  const out: Op = [];
  for (const c of op) {
    if (isRetain(c)) { out.push(c); pos += c; }
    else if (isInsert(c)) out.push({ d: c.length });
    else { out.push(doc.slice(pos, pos + c.d)); pos += c.d; }
  }
  return normalize(out);
}

/** @id CODE-OPS-009 @implements REQ-OPS-012 */
export function isNoop(op: Op): boolean {
  return normalize(op).every(isRetain);
}
