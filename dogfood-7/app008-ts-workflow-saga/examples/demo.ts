import { History } from '@app008/history';
import { Registry } from '@app008/definitions';
import { LogicalClock } from '@app008/timers';
import { Engine } from '@app008/runtime';
import type { Handlers } from '@app008/runtime';

const history = new History('.demo-state');
const registry = new Registry();
registry.register({
  name: 'shipment', version: 1,
  steps: [
    { id: 'reserve', kind: 'activity', activity: 'reserve', compensation: 'release', retry: { maxAttempts: 3, base: 10, cap: 100 } },
    { id: 'delay', kind: 'timer', duration: 20 },
    { id: 'approval', kind: 'signal', signal: 'approved' },
    { id: 'ship', kind: 'activity', activity: 'ship', retry: { maxAttempts: 3, base: 10, cap: 100 } }
  ]
});
const clock = new LogicalClock(100);
const effects = new Map<string, unknown>();
const providers: Handlers = {
  reserve: async (input, ctx) => {
    if (!effects.has(ctx.effectKey)) effects.set(ctx.effectKey, { reservation: 'R-008', order: input });
    return effects.get(ctx.effectKey);
  },
  release: async () => null,
  ship: async (_input, ctx) => {
    if (ctx.attempt === 1) throw new Error('carrier temporarily unavailable');
    return { shipment: 'S-008', idempotencyKey: ctx.effectKey };
  }
};
let engine = new Engine(history, registry, clock, providers);
if (!history.read('demo').length) engine.start('demo', 'shipment', { order: 'O-008' });
let state = await engine.tick('demo');
console.log('Initial/replayed state:', state);
if (state.status !== 'completed') {
  engine = new Engine(new History('.demo-state'), registry, clock, providers);
  engine.signal('demo', 'approval-008', 'approved', { approved: true });
  clock.advanceTo(120);
  state = await engine.tick('demo');
  console.log('After timer and signal:', state);
  clock.advanceTo(130);
  console.log('After retry:', await engine.tick('demo'));
}
console.log('Persisted events:', history.read('demo').length);
