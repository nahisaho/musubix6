export type Priority = 'immediate' | 'normal' | 'idle';
export interface Scheduler {
  readonly pending: number;
  readonly errors: AggregateError[];
  schedule(fn: () => void, priority?: Priority, key?: unknown): () => void;
  flush(budget?: number): number;
}
const rank: Record<Priority, number> = { immediate: 0, normal: 1, idle: 2 };
interface Task { fn: () => void; priority: Priority; sequence: number; key: unknown }

/** @id CODE-SCHEDULER-001 @implements REQ-SCHEDULER-001 REQ-SCHEDULER-002 REQ-SCHEDULER-003 REQ-SCHEDULER-004 REQ-SCHEDULER-005 REQ-SCHEDULER-006 REQ-SCHEDULER-007 REQ-SCHEDULER-008 REQ-SCHEDULER-009 REQ-SCHEDULER-010 REQ-SCHEDULER-011 REQ-SCHEDULER-012 */
export function createScheduler(options: { auto?: boolean; onError?: (error: AggregateError) => void } = {}): Scheduler {
  const tasks = new Map<unknown, Task>();
  const errors: AggregateError[] = [];
  let sequence = 0, flushing = false, requested = false;
  function request(): void {
    if (!options.auto || requested || flushing) return;
    requested = true;
    queueMicrotask(() => {
      requested = false;
      try { scheduler.flush(); }
      catch (error) {
        const aggregate = error instanceof AggregateError ? error : new AggregateError([error]);
        if (options.onError) {
          try { options.onError(aggregate); }
          catch (handlerError) { errors.push(new AggregateError([aggregate, handlerError], 'onError failed')); }
        } else errors.push(aggregate);
      }
    });
  }
  const scheduler: Scheduler = {
    get pending() { return tasks.size; },
    errors,
    schedule(fn, priority = 'normal', key = Symbol('task')) {
      if (!Object.hasOwn(rank, priority)) throw new TypeError('invalid priority');
      if (typeof fn !== 'function') throw new TypeError('task must be a function');
      const task: Task = { fn, priority, sequence: sequence++, key };
      tasks.set(key, task); request();
      return () => { if (tasks.get(key) === task) tasks.delete(key); };
    },
    flush(budget = Infinity) {
      if (flushing) throw new Error('reentrant flush');
      if (budget !== Infinity && (!Number.isSafeInteger(budget) || budget < 0)) throw new RangeError('invalid budget');
      flushing = true;
      const failures: unknown[] = [];
      let count = 0;
      try {
        while (tasks.size && count < budget) {
          const task = [...tasks.values()].sort((a, b) => rank[a.priority] - rank[b.priority] || a.sequence - b.sequence)[0];
          tasks.delete(task.key); count++;
          try { task.fn(); } catch (error) { failures.push(error); }
        }
      } finally { flushing = false; if (tasks.size) request(); }
      if (failures.length) throw new AggregateError(failures, 'scheduled tasks failed');
      return count;
    }
  };
  return scheduler;
}
