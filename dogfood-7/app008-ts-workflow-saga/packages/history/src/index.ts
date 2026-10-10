import { createHash } from 'node:crypto';
import { mkdirSync, openSync, closeSync, fsyncSync, readFileSync, writeSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export interface EventInput { type: string; data: Record<string, any> }
export interface Event extends EventInput { runId: string; seq: number; prev: string; hash: string }
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function identifier(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.length || value.length > 256 || /[\u0000-\u001f]/.test(value)) {
    throw new TypeError('invalid identifier');
  }
}

/** @id CODE-HISTORY-002 @implements REQ-HISTORY-005 REQ-HISTORY-007 */
export function canonical(value: unknown): string {
  const seen = new Set<object>();
  function visit(v: unknown): string {
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v);
    if (typeof v !== 'object' || !v || seen.has(v)) throw new TypeError('invalid JSON value');
    if (Object.getOwnPropertySymbols(v).length) throw new TypeError('invalid JSON symbol');
    const proto = Object.getPrototypeOf(v);
    if (!Array.isArray(v) && proto !== Object.prototype && proto !== null) throw new TypeError('invalid JSON object');
    seen.add(v);
    try {
      if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) {
          const d = Object.getOwnPropertyDescriptor(v, String(i));
          if (!d || !('value' in d)) throw new TypeError('invalid JSON array');
        }
        if (Object.keys(v).length !== v.length) throw new TypeError('invalid JSON array property');
        return `[${v.map(visit).join(',')}]`;
      }
      return `{${Object.keys(v).sort().map(k => {
        const d = Object.getOwnPropertyDescriptor(v, k)!;
        if (!('value' in d)) throw new TypeError('invalid JSON accessor');
        return `${JSON.stringify(k)}:${visit(d.value)}`;
      }).join(',')}}`;
    } finally { seen.delete(v); }
  }
  return visit(value);
}
export function jsonCopy<T>(value: T): T { return JSON.parse(canonical(value)); }

/** @id CODE-HISTORY-001 @implements REQ-HISTORY-001 REQ-HISTORY-002 REQ-HISTORY-003 REQ-HISTORY-004 REQ-HISTORY-006 REQ-HISTORY-008 REQ-HISTORY-009 REQ-HISTORY-010 */
export class History {
  readonly directory: string;
  readonly file: string;
  constructor(directory: string) {
    this.directory = directory; this.file = join(directory, 'history.jsonl');
    mkdirSync(directory, { recursive: true });
    const fd = openSync(this.file, 'a');
    try { fsyncSync(fd); } finally { closeSync(fd); }
    const dir = openSync(directory, 'r');
    try { fsyncSync(dir); } finally { closeSync(dir); }
  }
  private load(): Event[] {
    const content = readFileSync(this.file, 'utf8');
    if (!content) return [];
    try {
      if (!content.endsWith('\n')) throw new Error('incomplete tail');
      let prev = ''; const sequences = new Map<string, number>();
      return content.slice(0, -1).split('\n').map(line => {
        const e: Event = JSON.parse(line);
        identifier(e.runId);
        if (typeof e.type !== 'string' || !e.type || !e.data || typeof e.data !== 'object' || Array.isArray(e.data)) {
          throw new Error('invalid event');
        }
        const { hash: actual, ...base } = e;
        if (e.prev !== prev || actual !== hash(`${prev}\n${canonical(base)}`) || e.seq !== (sequences.get(e.runId) ?? 0) + 1) {
          throw new Error('chain mismatch');
        }
        sequences.set(e.runId, e.seq); prev = actual; return e;
      });
    } catch (error) { throw new Error('corrupt history', { cause: error }); }
  }
  read(runId: string): Event[] {
    identifier(runId); return this.load().filter(e => e.runId === runId);
  }
  private lock(path: string): () => void {
    try { mkdirSync(path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('busy: exclusive lock held');
      throw error;
    }
    let released = false;
    return () => { if (!released) { rmSync(path, { recursive: true }); released = true; } };
  }
  acquireLease(runId: string): () => void {
    identifier(runId); return this.lock(join(this.directory, `run-${hash(runId)}.lock`));
  }
  append(runId: string, expected: number, input: EventInput[]): Event[] {
    identifier(runId);
    if (!Number.isSafeInteger(expected) || expected < 0) throw new TypeError('invalid sequence');
    if (!Array.isArray(input) || !input.length) throw new TypeError('empty event batch');
    const entries = jsonCopy(input);
    for (const e of entries) {
      if (!e || typeof e.type !== 'string' || !e.type.length || e.type.length > 256) throw new TypeError('invalid event type');
      if (!e.data || typeof e.data !== 'object' || Array.isArray(e.data)) throw new TypeError('invalid JSON event data');
    }
    const release = this.lock(join(this.directory, 'append.lock'));
    try {
      const all = this.load(); const seq = all.filter(e => e.runId === runId).length;
      if (seq !== expected) throw new Error('conflict: stale sequence');
      let prev = all.at(-1)?.hash ?? '';
      const events = entries.map((e, i) => {
        const base = { runId, seq: seq + i + 1, type: e.type, data: e.data, prev };
        const record = { ...base, hash: hash(`${prev}\n${canonical(base)}`) };
        prev = record.hash; return record;
      });
      const data = Buffer.from(events.map(e => canonical(e)).join('\n') + '\n');
      const fd = openSync(this.file, 'a');
      try {
        let offset = 0;
        while (offset < data.length) {
          const written = writeSync(fd, data, offset, data.length - offset);
          if (!written) throw new Error('history write made no progress');
          offset += written;
        }
        fsyncSync(fd);
      } finally { closeSync(fd); }
      return events;
    } finally { release(); }
  }
}
