import { History, identifier, jsonCopy } from '@app008/history';
import type { Event } from '@app008/history';
import { Registry, digest } from '@app008/definitions';
import type { Definition } from '@app008/definitions';
import { LogicalClock, validTime } from '@app008/timers';
import { compensations, PermanentError, retryDecision } from '@app008/saga';
import type { Success } from '@app008/saga';

export interface Context { runId: string; step: string; attempt: number; effectKey: string; compensation: boolean }
export type Handler = (input: unknown, context: Context) => unknown | Promise<unknown>;
export type Handlers = Record<string, Handler>;
export interface State { status: 'running' | 'waiting' | 'completed' | 'compensating' | 'failed'; output: unknown }
const last = (events: Event[], type: string, step?: string) =>
  events.findLast(e => e.type === type && (step === undefined || e.data.step === step));
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const effectKey = (runId: string, step: string, attempt: number) =>
  `${encodeURIComponent(runId)}:activity:${encodeURIComponent(step)}:${attempt}`;

/** @id CODE-RUNTIME-001 @implements REQ-RUNTIME-001 REQ-RUNTIME-002 REQ-RUNTIME-003 REQ-RUNTIME-004 REQ-RUNTIME-005 REQ-RUNTIME-006 REQ-RUNTIME-007 REQ-RUNTIME-008 REQ-RUNTIME-009 REQ-RUNTIME-010 */
export class Engine {
  readonly history: History;
  readonly registry: Registry;
  readonly clock: LogicalClock;
  private handlers: Handlers;
  constructor(history: History, registry: Registry, clock: LogicalClock, handlers: Handlers) {
    this.history = history; this.registry = registry; this.clock = clock; this.handlers = handlers;
  }
  start(runId: string, name: string, input: unknown, version?: number): void {
    identifier(runId);
    const definition = this.registry.get(name, version);
    this.history.append(runId, 0, [{ type: 'Started', data: {
      definition, name, version: definition.version, digest: digest(definition), input: jsonCopy(input), time: this.clock.now
    } }]);
  }
  private append(runId: string, type: string, data: Record<string, unknown>): void {
    const expected = this.history.read(runId).length;
    this.history.append(runId, expected, [{ type, data }]);
  }
  private load(runId: string): { events: Event[]; definition: Definition } {
    const events = this.history.read(runId); const started = events[0];
    if (!started || started.type !== 'Started') throw new Error('unknown workflow run');
    const d = this.registry.get(started.data.name, started.data.version);
    if (digest(d) !== started.data.digest || digest(started.data.definition) !== started.data.digest) {
      throw new Error('definition digest mismatch');
    }
    return { events, definition: d };
  }
  private output(events: Event[]): unknown {
    const done = events.findLast(e => e.type === 'ActivitySucceeded' || e.type === 'SignalConsumed');
    return done ? done.data.output : events[0].data.input;
  }
  private state(status: State['status'], events: Event[]): State {
    const terminal = last(events, 'Completed') ?? last(events, 'Failed');
    return { status, output: terminal ? terminal.data.output : this.output(events) };
  }
  signal(runId: string, id: string, name: string, payload: unknown): boolean {
    identifier(id); identifier(name);
    const { events } = this.load(runId); const copied = jsonCopy(payload);
    const prior = events.find(e => e.type === 'SignalReceived' && e.data.id === id);
    if (prior) {
      if (prior.data.name !== name || digest(prior.data.payload) !== digest(copied)) throw new Error('signal id conflict');
      return false;
    }
    if (last(events, 'Completed') || last(events, 'Failed')) throw new Error('terminal workflow cannot accept signals');
    this.history.append(runId, events.length, [{ type: 'SignalReceived', data: { id, name, payload: copied } }]);
    return true;
  }
  async tick(runId: string): Promise<State> {
    const release = this.history.acquireLease(runId);
    try {
      let { events, definition } = this.load(runId);
      if (last(events, 'Completed')) return this.state('completed', events);
      if (last(events, 'Failed')) return this.state('failed', events);
      const fatal = events.find(e => e.type === 'ActivityFailed' && e.data.retryAt === null);
      if (fatal) return await this.compensate(runId, events, fatal.data.message);
      for (const step of definition.steps) {
        events = this.history.read(runId);
        if (step.kind === 'activity') {
          if (last(events, 'ActivitySucceeded', step.id)) continue;
          const failure = last(events, 'ActivityFailed', step.id);
          if (failure && failure.data.retryAt > this.clock.now) return this.state('waiting', events);
          /** @id CODE-RUNTIME-002 @implements REQ-RUNTIME-011 */
          const previous = last(events, 'ActivityAttempt', step.id);
          const pending = previous && (!failure || failure.seq < previous.seq);
          const attempt = pending ? previous.data.attempt : (previous?.data.attempt ?? 0) + 1;
          if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > step.retry.maxAttempts) {
            throw new Error('invalid persisted activity attempt');
          }
          const key = pending ? previous.data.effectKey : effectKey(runId, step.id, attempt);
          identifier(key);
          if (!pending) this.append(runId, 'ActivityAttempt', { step: step.id, attempt, effectKey: key });
          let output: unknown;
          try {
            const handler = this.provider(step.activity, 'activity');
            output = jsonCopy(await handler(this.output(events), { runId, step: step.id, attempt, effectKey: key, compensation: false }));
          } catch (error) {
            const retryAt = retryDecision(step.retry, attempt, this.clock.now, error);
            this.append(runId, 'ActivityFailed', { step: step.id, attempt, message: message(error), retryAt });
            return this.state(retryAt === null ? 'compensating' : 'waiting', this.history.read(runId));
          }
          this.append(runId, 'ActivitySucceeded', { step: step.id, attempt, output, ...(step.compensation ? { compensation: step.compensation } : {}) });
        } else if (step.kind === 'timer') {
          if (last(events, 'TimerFired', step.id)) continue;
          let scheduled = last(events, 'TimerScheduled', step.id);
          if (!scheduled) {
            const due = this.clock.now + step.duration; validTime(due);
            this.append(runId, 'TimerScheduled', { step: step.id, due });
            scheduled = last(this.history.read(runId), 'TimerScheduled', step.id)!;
          }
          if (scheduled.data.due > this.clock.now) return this.state('waiting', this.history.read(runId));
          this.append(runId, 'TimerFired', { step: step.id, due: scheduled.data.due });
        } else {
          if (last(events, 'SignalConsumed', step.id)) continue;
          const consumed = new Set(events.filter(e => e.type === 'SignalConsumed').map(e => e.data.id));
          const signal = events.find(e => e.type === 'SignalReceived' && e.data.name === step.signal && !consumed.has(e.data.id));
          if (!signal) return this.state('waiting', events);
          this.append(runId, 'SignalConsumed', { step: step.id, id: signal.data.id, output: signal.data.payload });
        }
      }
      events = this.history.read(runId);
      this.append(runId, 'Completed', { output: this.output(events) });
      return this.state('completed', this.history.read(runId));
    } finally { release(); }
  }
  /** @id CODE-RUNTIME-003 @implements REQ-RUNTIME-012 */
  private provider(name: string, kind: 'activity' | 'compensation'): Handler {
    if (!Object.hasOwn(this.handlers, name) || typeof this.handlers[name] !== 'function') {
      throw new PermanentError(`unknown ${kind}: ${name}`);
    }
    return this.handlers[name];
  }
  private async compensate(runId: string, events: Event[], error: string): Promise<State> {
    const successful: Success[] = events.filter(e => e.type === 'ActivitySucceeded').map(e => ({
      step: e.data.step, compensation: e.data.compensation, output: e.data.output
    }));
    const completed = events.filter(e => e.type === 'CompensationSucceeded').map(e => e.data.step);
    for (const work of compensations(runId, successful, completed)) {
      this.append(runId, 'CompensationAttempt', { step: work.step, effectKey: work.effectKey });
      try {
        const handler = this.provider(work.compensation, 'compensation');
        await handler(work.output, { runId, step: work.step, attempt: 1, effectKey: work.effectKey, compensation: true });
      } catch (error) {
        this.append(runId, 'CompensationFailed', { step: work.step, message: message(error) });
        return this.state('compensating', this.history.read(runId));
      }
      this.append(runId, 'CompensationSucceeded', { step: work.step });
    }
    this.append(runId, 'Failed', { message: error, output: this.output(events) });
    return this.state('failed', this.history.read(runId));
  }
}
