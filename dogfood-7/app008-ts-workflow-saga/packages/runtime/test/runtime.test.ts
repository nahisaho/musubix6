import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { History } from '@app008/history';
import { Registry, digest } from '@app008/definitions';
import type { Definition, Step } from '@app008/definitions';
import { LogicalClock } from '@app008/timers';
import { PermanentError } from '@app008/saga';
import { Engine } from '../src/index.ts';
import type { Handlers } from '../src/index.ts';

const activity = (id: string, compensation?: string): Step => ({
  id, kind: 'activity', activity: id, ...(compensation ? { compensation } : {}),
  retry: { maxAttempts: 3, base: 10, cap: 100 }
});
async function fixture(steps: Step[], handlers: Handlers, fn: (e: Engine, h: History, r: Registry, c: LogicalClock, path: string) => Promise<void>) {
  const path = mkdtempSync(join(process.cwd(), '.test-work-'));
  try {
    const h = new History(path); const r = new Registry(); const c = new LogicalClock(100);
    r.register({ name: 'workflow', version: 1, steps });
    await fn(new Engine(h, r, c, handlers), h, r, c, path);
  } finally { rmSync(path, { recursive: true, force: true }); }
}
/** @id TEST-RUNTIME-001 @verifies REQ-RUNTIME-001 */
test('TEST-RUNTIME-001 sequential output chaining', () => fixture([activity('a'), activity('b')], {
  a: async input => Number(input) + 1, b: async input => Number(input) * 2
}, async (e, h) => {
  e.start('r', 'workflow', 3);
  assert.deepEqual(await e.tick('r'), { status: 'completed', output: 8 });
  assert.deepEqual(h.read('r').map(e => e.type), ['Started', 'ActivityAttempt', 'ActivitySucceeded', 'ActivityAttempt', 'ActivitySucceeded', 'Completed']);
}));
/** @id TEST-RUNTIME-002 @verifies REQ-RUNTIME-002 */
test('TEST-RUNTIME-002 completed replay avoids effects', () => {
  let calls = 0;
  return fixture([activity('a')], { a: async () => ++calls }, async (e, h, r, c, path) => {
    e.start('r', 'workflow', null); await e.tick('r');
    const restarted = new Engine(new History(path), r, c, { a: async () => ++calls });
    assert.equal((await restarted.tick('r')).status, 'completed'); assert.equal(calls, 1); assert.equal(h.read('r').length, 4);
  });
});
/** @id TEST-RUNTIME-003 @verifies REQ-RUNTIME-003 */
test('TEST-RUNTIME-003 definition version pinning', () => fixture([activity('a')], { a: async () => 'v1', b: async () => 'v2' }, async (e, h, r) => {
  e.start('old', 'workflow', null); r.register({ name: 'workflow', version: 2, steps: [activity('b')] });
  e.start('new', 'workflow', null);
  assert.equal((await e.tick('old')).output, 'v1'); assert.equal((await e.tick('new')).output, 'v2');
  assert.equal(h.read('old')[0].data.version, 1);
}));
/** @id TEST-RUNTIME-004 @verifies REQ-RUNTIME-004 */
test('TEST-RUNTIME-004 timer deadline replay', () => fixture([{ id: 'wait', kind: 'timer', duration: 20 }], {}, async (e, h, r, c, path) => {
  e.start('r', 'workflow', null); assert.equal((await e.tick('r')).status, 'waiting');
  c.advanceTo(119); const restarted = new Engine(new History(path), r, c, {});
  assert.equal((await restarted.tick('r')).status, 'waiting');
  assert.equal(h.read('r').find(e => e.type === 'TimerScheduled')!.data.due, 120);
  c.advanceTo(120); assert.equal((await restarted.tick('r')).status, 'completed');
  assert.equal(h.read('r').filter(e => e.type === 'TimerFired').length, 1);
}));
/** @id TEST-RUNTIME-005 @verifies REQ-RUNTIME-005 */
test('TEST-RUNTIME-005 durable backoff and exhaustion', () => {
  let calls = 0;
  return fixture([activity('a')], { a: async () => { calls++; throw new Error('offline'); } }, async (e, h, r, c, path) => {
    e.start('r', 'workflow', null); await e.tick('r'); await e.tick('r'); assert.equal(calls, 1);
    c.advanceTo(110); const restarted = new Engine(new History(path), r, c, { a: async () => { calls++; throw new Error('offline'); } });
    await restarted.tick('r'); assert.equal(calls, 2); c.advanceTo(129); await restarted.tick('r'); assert.equal(calls, 2);
    c.advanceTo(130); await restarted.tick('r'); assert.equal((await restarted.tick('r')).status, 'failed'); assert.equal(calls, 3);
    assert.deepEqual(h.read('r').filter(e => e.type === 'ActivityFailed').map(e => e.data.retryAt), [110, 130, null]);
  });
});
/** @id TEST-RUNTIME-006 @verifies REQ-RUNTIME-006 */
test('TEST-RUNTIME-006 buffered signals consumed once', () => fixture([
  { id: 'first', kind: 'signal', signal: 'approve' }, { id: 'second', kind: 'signal', signal: 'approve' }
], {}, async (e, h) => {
  e.start('r', 'workflow', null); e.signal('r', 's1', 'approve', 1);
  assert.equal((await e.tick('r')).status, 'waiting'); e.signal('r', 's2', 'approve', 2);
  assert.equal((await e.tick('r')).output, 2);
  assert.deepEqual(h.read('r').filter(e => e.type === 'SignalConsumed').map(e => e.data.id), ['s1', 's2']);
}));
/** @id TEST-RUNTIME-007 @verifies REQ-RUNTIME-007 */
test('TEST-RUNTIME-007 signal deduplication', () => fixture([{ id: 's', kind: 'signal', signal: 'ok' }], {}, async e => {
  e.start('r', 'workflow', null); assert.equal(e.signal('r', 'id', 'ok', { x: 1 }), true);
  assert.equal(e.signal('r', 'id', 'ok', { x: 1 }), false);
  assert.throws(() => e.signal('r', 'id', 'ok', { x: 2 }), /conflict/i);
  await e.tick('r'); assert.throws(() => e.signal('r', 'new', 'ok', 1), /terminal/i);
}));
/** @id TEST-RUNTIME-008 @verifies REQ-RUNTIME-008 */
test('TEST-RUNTIME-008 reverse compensation before failure', () => {
  const undo: string[] = [];
  return fixture([activity('a', 'undoA'), activity('b', 'undoB'), activity('c')], {
    a: async () => 'a', b: async () => 'b', c: async () => { throw new PermanentError('declined'); },
    undoA: async input => { undo.push(String(input)); return null; },
    undoB: async input => { undo.push(String(input)); return null; }
  }, async (e, h) => {
    e.start('r', 'workflow', null); await e.tick('r'); assert.equal((await e.tick('r')).status, 'failed');
    assert.deepEqual(undo, ['b', 'a']); assert.equal(h.read('r').at(-1)!.type, 'Failed');
    await e.tick('r'); assert.deepEqual(undo, ['b', 'a']);
  });
});
/** @id TEST-RUNTIME-009 @verifies REQ-RUNTIME-009 */
test('TEST-RUNTIME-009 executor lease across engines', () => {
  let calls = 0; let finish!: (value: unknown) => void;
  return fixture([activity('a')], { a: () => { calls++; return new Promise(resolve => { finish = resolve; }); } }, async (e, h, r, c, path) => {
    e.start('r', 'workflow', null); const pending = e.tick('r');
    const other = new Engine(new History(path), r, c, { a: async () => ++calls });
    try { await assert.rejects(other.tick('r'), /busy/i); assert.equal(calls, 1); }
    finally { finish('done'); await pending; }
    assert.equal((await other.tick('r')).status, 'completed'); assert.equal(h.read('r').filter(e => e.type === 'ActivityAttempt').length, 1);
  });
});
/** @id TEST-RUNTIME-010 @verifies REQ-RUNTIME-010 */
test('TEST-RUNTIME-010 pinned digest mismatch rejected', () => fixture([activity('a')], { a: async () => 'done' }, async (e, h, r, c) => {
  e.start('r', 'workflow', null);
  const changed: Definition = { name: 'workflow', version: 1, steps: [activity('b')] };
  const fresh = new Registry(); fresh.register(changed);
  assert.notEqual(digest(r.get('workflow', 1)), digest(changed));
  await assert.rejects(new Engine(h, fresh, c, { b: async () => 'wrong' }).tick('r'), /definition.*mismatch/i);
  assert.equal(h.read('r').length, 1);
}));
/** @id TEST-RUNTIME-011 @verifies REQ-RUNTIME-011 */
test('TEST-RUNTIME-011 interrupted activity reuses recorded identity', () => {
  const applied = new Map<string, string>([['r:activity:a:1', 'charged-once']]);
  const seen: number[] = [];
  return fixture([activity('a')], {
    a: async (_input, ctx) => {
      seen.push(ctx.attempt);
      if (!applied.has(ctx.effectKey)) applied.set(ctx.effectKey, 'duplicate-charge');
      return applied.get(ctx.effectKey)!;
    }
  }, async (e, h, r, c, path) => {
    e.start('r', 'workflow', null);
    h.append('r', 1, [{ type: 'ActivityAttempt', data: { step: 'a', attempt: 1, effectKey: 'r:activity:a:1' } }]);
    const restarted = new Engine(new History(path), r, c, {
      a: async (_input, ctx) => {
        seen.push(ctx.attempt);
        if (!applied.has(ctx.effectKey)) applied.set(ctx.effectKey, 'duplicate-charge');
        return applied.get(ctx.effectKey)!;
      }
    });
    assert.equal((await restarted.tick('r')).output, 'charged-once');
    assert.equal(applied.size, 1); assert.deepEqual(seen, [1]);
    assert.equal(h.read('r').filter(e => e.type === 'ActivityAttempt').length, 1);
  });
});
/** @id TEST-RUNTIME-012 @verifies REQ-RUNTIME-012 */
test('TEST-RUNTIME-012 own callable providers only', async () => {
  await fixture([activity('toString')], {}, async (e, h) => {
    e.start('r', 'workflow', null); await e.tick('r');
    assert.equal((await e.tick('r')).status, 'failed');
    assert.match(h.read('r').find(e => e.type === 'ActivityFailed')!.data.message, /unknown activity/i);
  });
  await fixture([activity('a', 'toString'), activity('b')], {
    a: async () => 1, b: async () => { throw new PermanentError('declined'); }
  }, async (e, h) => {
    e.start('r', 'workflow', null); await e.tick('r');
    assert.equal((await e.tick('r')).status, 'compensating');
    assert.equal(h.read('r').filter(e => e.type === 'CompensationSucceeded').length, 0);
    assert.match(h.read('r').find(e => e.type === 'CompensationFailed')!.data.message, /unknown compensation/i);
  });
  await fixture([activity('a')], { a: 42 } as unknown as Handlers, async (e, h) => {
    e.start('r', 'workflow', null); await e.tick('r'); await e.tick('r');
    assert.equal(h.read('r').find(e => e.type === 'ActivityFailed')!.data.retryAt, null);
  });
});
/** @id TEST-RUNTIME-013 @verifies REQ-RUNTIME-013 */
test('TEST-RUNTIME-013 compensation failure restart characterization', () => {
  const undone: string[] = []; let attempts = 0;
  const providers: Handlers = {
    a: async () => 'a', b: async () => 'b', c: async () => { throw new PermanentError('no'); },
    undoA: async (_input, ctx) => { undone.push(ctx.effectKey); return null; },
    undoB: async (_input, ctx) => {
      if (++attempts === 1) throw new Error('temporary compensation outage');
      undone.push(ctx.effectKey); return null;
    }
  };
  return fixture([activity('a', 'undoA'), activity('b', 'undoB'), activity('c')], providers, async (e, h, r, c, path) => {
    e.start('r', 'workflow', null); await e.tick('r'); assert.equal((await e.tick('r')).status, 'compensating');
    const restarted = new Engine(new History(path), r, c, providers);
    assert.equal((await restarted.tick('r')).status, 'failed');
    assert.deepEqual(undone, ['r:compensate:b', 'r:compensate:a']);
    assert.deepEqual(h.read('r').filter(e => e.type === 'CompensationAttempt' && e.data.step === 'b').map(e => e.data.effectKey),
      ['r:compensate:b', 'r:compensate:b']);
    await restarted.tick('r'); assert.equal(attempts, 2); assert.equal(undone.length, 2);
  });
});
/** @id TEST-RUNTIME-014 @verifies REQ-RUNTIME-014 */
test('TEST-RUNTIME-014 concurrent signal characterization', () => {
  let finish!: (value: unknown) => void;
  return fixture([activity('a'), { id: 'approve', kind: 'signal', signal: 'ok' }], {
    a: () => new Promise(resolve => { finish = resolve; })
  }, async (e, h) => {
    e.start('r', 'workflow', null); const pending = e.tick('r');
    try { assert.equal(e.signal('r', 's1', 'ok', { approved: true }), true); }
    finally { finish(1); }
    assert.deepEqual(await pending, { status: 'completed', output: { approved: true } });
    assert.deepEqual(h.read('r').map(e => e.seq), [1, 2, 3, 4, 5, 6]);
    assert.equal(h.read('r').filter(e => e.type === 'SignalConsumed').length, 1);
  });
});
