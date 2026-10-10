import { describe, it, expect } from 'vitest';
import { OpError, type Op } from '@ot/core';
import { Server } from '@ot/server';
import { Client, ProtocolError, type Message } from '../src/client';

function mk(doc = 'abc', rev = 0): { c: Client; sent: Message[] } {
  const sent: Message[] = [];
  return { c: new Client('A', doc, rev, (m) => sent.push(m)), sent };
}

function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function randomOp(doc: string, r: () => number): Op {
  const n = doc.length;
  const pos = Math.floor(r() * (n + 1));
  if (n === pos || r() < 0.6) return [pos, String.fromCharCode(97 + Math.floor(r() * 26)), n - pos].filter((c) => c !== 0);
  const k = 1 + Math.floor(r() * Math.min(3, n - pos));
  return [pos, { d: k }, n - pos - k].filter((c) => c !== 0);
}

describe('client', () => {
  /** @id TEST-CLIENT-001 @verifies REQ-CLIENT-001 */
  it('TEST-CLIENT-001 first local op is sent', () => {
    const { c, sent } = mk();
    expect(c.state).toBe('synchronized');
    c.local(['X', 3]);
    expect(sent).toEqual([{ clientId: 'A', seq: 1, baseRev: 0, op: ['X', 3] }]);
    expect(c.state).toBe('awaiting');
    expect(c.doc).toBe('Xabc');
  });

  /** @id TEST-CLIENT-002 @verifies REQ-CLIENT-002 */
  it('TEST-CLIENT-002 second local op is buffered', () => {
    const { c, sent } = mk();
    c.local(['X', 3]);
    c.local([4, 'Y']);
    expect(sent).toHaveLength(1);
    expect(c.state).toBe('buffering');
    expect(c.doc).toBe('XabcY');
  });

  /** @id TEST-CLIENT-003 @verifies REQ-CLIENT-003 */
  it('TEST-CLIENT-003 buffer composes', () => {
    const { c, sent } = mk();
    c.local(['X', 3]);
    c.local([4, 'Y']);
    c.local([1, { d: 2 }, 2, 'Z']);
    expect(sent).toHaveLength(1);
    expect(c.pending.buffer).toEqual([1, { d: 2 }, 1, 'YZ']);
  });

  /** @id TEST-CLIENT-004 @verifies REQ-CLIENT-004 */
  it('TEST-CLIENT-004 ack returns to synchronized', () => {
    const { c } = mk();
    c.local(['X', 3]);
    c.ack();
    expect(c.state).toBe('synchronized');
    expect(c.rev).toBe(1);
  });

  /** @id TEST-CLIENT-005 @verifies REQ-CLIENT-005 */
  it('TEST-CLIENT-005 ack flushes the buffer', () => {
    const { c, sent } = mk();
    c.local(['X', 3]);
    c.local([4, 'Y']);
    c.ack();
    expect(c.state).toBe('awaiting');
    expect(sent[1]).toEqual({ clientId: 'A', seq: 2, baseRev: 1, op: [4, 'Y'] });
    expect(c.rev).toBe(1);
  });

  /** @id TEST-CLIENT-006 @verifies REQ-CLIENT-006 */
  it('TEST-CLIENT-006 server op applies when synchronized', () => {
    const { c } = mk();
    c.serverOp([{ d: 1 }, 2]);
    expect(c.doc).toBe('bc');
    expect(c.rev).toBe(1);
    expect(c.state).toBe('synchronized');
  });

  /** @id TEST-CLIENT-007 @verifies REQ-CLIENT-007 */
  it('TEST-CLIENT-007 server op transforms outstanding', () => {
    const { c } = mk();
    c.local(['X', 3]);
    c.serverOp(['S', 3]);
    expect(c.doc).toBe('SXabc');
    expect(c.pending.outstanding).toEqual([1, 'X', 3]);
    expect(c.rev).toBe(1);
    expect(c.state).toBe('awaiting');
  });

  /** @id TEST-CLIENT-008 @verifies REQ-CLIENT-008 */
  it('TEST-CLIENT-008 server op transforms outstanding and buffer', () => {
    const { c } = mk();
    c.local(['X', 3]);
    c.local([4, 'Y']);
    c.serverOp([1, { d: 1 }, 'S', 1]);
    expect(c.doc).toBe('XaScY');
    expect(c.pending.outstanding).toEqual(['X', 3]);
    expect(c.pending.buffer).toEqual([4, 'Y']);
    expect(c.state).toBe('buffering');
  });

  /** @id TEST-CLIENT-009 @verifies REQ-CLIENT-009 */
  it('TEST-CLIENT-009 ack while synchronized is a protocol error', () => {
    const { c } = mk();
    expect(() => c.ack()).toThrow(ProtocolError);
  });

  /** @id TEST-CLIENT-010 @verifies REQ-CLIENT-010 */
  it('TEST-CLIENT-010 seq increments', () => {
    const { c, sent } = mk();
    for (let i = 0; i < 3; i++) { c.local([c.doc.length, 'x'].filter((v) => v !== 0)); c.ack(); }
    expect(sent.map((m) => m.seq)).toEqual([1, 2, 3]);
  });

  /** @id TEST-CLIENT-011 @verifies REQ-CLIENT-011 */
  it('TEST-CLIENT-011 wrong base length leaves state unchanged', () => {
    const { c, sent } = mk();
    expect(() => c.local([5])).toThrow(OpError);
    expect(c.doc).toBe('abc');
    expect(c.state).toBe('synchronized');
    expect(sent).toHaveLength(0);
    c.local(['X', 3]);
    expect(() => c.serverOp([9])).toThrow(OpError);
    expect(c.rev).toBe(0);
    expect(c.pending.outstanding).toEqual(['X', 3]);
  });

  /** @id TEST-CLIENT-012 @verifies REQ-CLIENT-012 */
  it('TEST-CLIENT-012 random interleavings converge', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = prng(seed);
      const server = new Server('seed');
      const up: Message[][] = [[], [], []];
      const down: Array<Array<{ ack: boolean; op: Op }>> = [[], [], []];
      const ids = ['A', 'B', 'C'];
      const clients = ids.map((id, i) => new Client(id, 'seed', 0, (m) => up[i].push(m)));
      server.subscribe((b) => ids.forEach((id, i) => down[i].push({ ack: id === b.origin, op: b.op })));
      for (let step = 0; step < 120; step++) {
        const i = Math.floor(r() * 3);
        const x = r();
        if (x < 0.4) clients[i].local(randomOp(clients[i].doc, r));
        else if (x < 0.7 && up[i].length) { const m = up[i].shift()!; server.receive(m.clientId, m.seq, m.baseRev, m.op); }
        else if (down[i].length) { const d = down[i].shift()!; d.ack ? clients[i].ack() : clients[i].serverOp(d.op); }
      }
      for (let guard = 0; guard < 1000 && (up.some((q) => q.length) || down.some((q) => q.length)); guard++) {
        for (let i = 0; i < 3; i++) {
          while (up[i].length) { const m = up[i].shift()!; server.receive(m.clientId, m.seq, m.baseRev, m.op); }
          while (down[i].length) { const d = down[i].shift()!; d.ack ? clients[i].ack() : clients[i].serverOp(d.op); }
        }
      }
      for (const c of clients) { expect(c.doc).toBe(server.doc); expect(c.state).toBe('synchronized'); }
    }
  });
});
