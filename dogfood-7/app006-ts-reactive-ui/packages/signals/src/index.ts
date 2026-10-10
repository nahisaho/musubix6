export interface Readable<T> { get(): T }
export interface Signal<T> extends Readable<T> { set(value: T): void }
type Dependency = Set<Observer>;
interface Observer { deps: Set<Dependency>; notify(): void }
let active: Observer | undefined;
let depth = 0;
let draining = false;
const pending = new Set<EffectObserver>();

function detach(o: Observer): void {
  for (const d of o.deps) d.delete(o);
  o.deps.clear();
}
function track(d: Dependency): void {
  if (active) { d.add(active); active.deps.add(d); }
}
function invalidate(d: Dependency): void {
  depth++;
  try { for (const o of [...d]) o.notify(); }
  finally { depth--; }
  if (!depth) drain();
}
function drain(): void {
  if (draining || depth) return;
  draining = true;
  const runs = new Map<EffectObserver, number>();
  try {
    while (pending.size) {
      const o = pending.values().next().value!;
      pending.delete(o);
      if (o.disposed) continue;
      const count = (runs.get(o) ?? 0) + 1;
      runs.set(o, count);
      if (count > 100) { o.dispose(); throw new Error('reactive cycle exceeded 100 runs'); }
      o.run();
    }
  } catch (error) {
    pending.clear();
    throw error;
  } finally { draining = false; }
}

/** @id CODE-SIGNALS-001 @implements REQ-SIGNALS-001 REQ-SIGNALS-003 */
export function signal<T>(value: T): Signal<T> {
  const subscribers: Dependency = new Set();
  return {
    get() { track(subscribers); return value; },
    set(next) {
      if (Object.is(value, next)) return;
      value = next; invalidate(subscribers);
    }
  };
}

/** @id CODE-SIGNALS-002 @implements REQ-SIGNALS-002 REQ-SIGNALS-004 REQ-SIGNALS-007 REQ-SIGNALS-008 REQ-SIGNALS-010 REQ-SIGNALS-013 */
class EffectObserver implements Observer {
  deps = new Set<Dependency>();
  disposed = false;
  cleanup: (() => void) | undefined;
  fn: () => void | (() => void);
  constructor(fn: () => void | (() => void)) { this.fn = fn; }
  notify(): void { if (!this.disposed) pending.add(this); }
  run(): void {
    detach(this);
    const cleanup = this.cleanup; this.cleanup = undefined;
    if (cleanup) untrack(cleanup);
    if (this.disposed) return;
    const previous = active; active = this;
    try {
      const result = this.fn();
      if (typeof result === 'function') {
        if (this.disposed) untrack(result);
        else this.cleanup = result;
      }
    } finally { active = previous; }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; pending.delete(this); detach(this);
    const cleanup = this.cleanup; this.cleanup = undefined;
    if (cleanup) untrack(cleanup);
  }
}
export function effect(fn: () => void | (() => void)): () => void {
  const observer = new EffectObserver(fn);
  observer.notify();
  try { drain(); } catch (error) { observer.dispose(); throw error; }
  return () => observer.dispose();
}

/** @id CODE-SIGNALS-005 @implements REQ-SIGNALS-005 */
export function batch<T>(fn: () => T): T {
  depth++;
  try { return fn(); }
  finally { depth--; if (!depth) drain(); }
}

/** @id CODE-SIGNALS-006 @implements REQ-SIGNALS-006 REQ-SIGNALS-011 REQ-SIGNALS-012 */
export function computed<T>(fn: () => T): Readable<T> {
  const subscribers: Dependency = new Set();
  let dirty = true, evaluating = false, failed = false, cached: T;
  const observer: Observer = {
    deps: new Set(),
    notify() {
      if (dirty && !failed) return;
      dirty = true; failed = false;
      invalidate(subscribers);
    }
  };
  return {
    get() {
      track(subscribers);
      if (dirty) {
        if (evaluating) throw new Error('computed cycle');
        evaluating = true; detach(observer);
        const previous = active; active = observer;
        try { cached = fn(); dirty = false; failed = false; }
        catch (error) { failed = true; throw error; }
        finally { active = previous; evaluating = false; }
      }
      return cached!;
    }
  };
}

/** @id CODE-SIGNALS-009 @implements REQ-SIGNALS-009 */
export function untrack<T>(fn: () => T): T {
  const previous = active; active = undefined;
  try { return fn(); } finally { active = previous; }
}
