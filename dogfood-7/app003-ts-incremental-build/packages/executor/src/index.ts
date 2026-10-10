import type { Graph } from '@build/graph';
export type State = 'pending'|'running'|'succeeded'|'failed'|'skipped'|'cancelled';
export const TRANSITIONS: Record<State, readonly State[]> = Object.freeze({
  pending:['running','skipped','cancelled'], running:['succeeded','failed','cancelled'],
  succeeded:[], failed:[], skipped:[], cancelled:[]
});
export interface Context { inputs: Map<string, unknown>; signal: AbortSignal }
export type Action = (context: Context) => Promise<unknown>;
export interface Execution {
  values: Map<string, unknown>; states: Map<string,State>; errors: Map<string,unknown>;
  events: {id:string;state:State;at:number}[];
}
interface Sleeper {
  deadline:number; sequence:number; resolve:()=>void; reject:(reason:unknown)=>void;
  cleanup:()=>void;
}
async function flush(): Promise<void> {
  await new Promise<void>(resolve=>setImmediate(resolve));
}
function abortError(): Error {
  return new DOMException('operation aborted','AbortError');
}
function duration(value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('duration must be finite and nonnegative');
}

/** @id CODE-EXECUTOR-001 @implements REQ-EXECUTOR-001 REQ-EXECUTOR-002 REQ-EXECUTOR-007 */
export class FakeClock {
  now = 0;
  private sequence = 0;
  private sleepers: Sleeper[] = [];
  private advancing=false;
  get pending(): number { return this.sleepers.length; }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    duration(ms);
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve,reject) => {
      const entry: Sleeper = {
        deadline:this.now+ms,sequence:this.sequence++,resolve,reject,
        cleanup:()=>signal?.removeEventListener('abort',cancel)
      };
      const cancel = (): void => {
        this.sleepers = this.sleepers.filter(sleeper => sleeper !== entry);
        entry.cleanup();
        reject(abortError());
      };
      signal?.addEventListener('abort',cancel,{once:true});
      this.sleepers.push(entry);
    });
  }

  /** @id CODE-EXECUTOR-009 @implements REQ-EXECUTOR-009 REQ-EXECUTOR-010 */
  async advance(ms: number): Promise<void> {
    duration(ms);
    if(this.advancing)throw new Error('clock already advancing');
    this.advancing=true;
    const target = this.now + ms;
    try{
      await flush();
      while (true) {
        this.sleepers.sort((a,b)=>a.deadline-b.deadline || a.sequence-b.sequence);
        const next = this.sleepers[0];
        if (!next || next.deadline > target) break;
        this.sleepers.shift();
        this.now = next.deadline;
        next.cleanup();
        next.resolve();
        await flush();
      }
      this.now = target;
      await flush();
    }finally{
      this.advancing=false;
    }
  }
}

/** @id CODE-EXECUTOR-003 @implements REQ-EXECUTOR-002 REQ-EXECUTOR-003 REQ-EXECUTOR-004 REQ-EXECUTOR-005 REQ-EXECUTOR-006 REQ-EXECUTOR-007 */
export class Executor {
  private concurrency: number;
  private clock: FakeClock;
  constructor(concurrency: number, clock: FakeClock) {
    if (!Number.isInteger(concurrency) || concurrency <= 0) throw new RangeError('concurrency must be a positive integer');
    this.concurrency = concurrency;
    this.clock = clock;
  }

  async run(graph: Graph, actions: Record<string,Action>, signal?: AbortSignal): Promise<Execution> {
    const order = graph.topology();
    const result: Execution = {values:new Map(),states:new Map(),errors:new Map(),events:[]};
    const controller = new AbortController();
    let active = 0;
    const transition = (id: string, state: State): void => {
      const prior = result.states.get(id);
      if (prior && !TRANSITIONS[prior].includes(state)) throw new Error(`illegal transition ${prior} -> ${state}`);
      result.states.set(id,state);
      result.events.push({id,state,at:this.clock.now});
    };
    order.forEach(id=>transition(id,'pending'));
    return new Promise(resolve => {
      const cancel = (): void => {
        controller.abort();
        schedule();
      };
      const finish = (): void => {
        signal?.removeEventListener('abort',cancel);
        resolve(result);
      };
      const schedule = (): void => {
        for (const id of order) {
          if (result.states.get(id) !== 'pending') continue;
          const deps = graph.dependencies(id);
          if (controller.signal.aborted) {
            transition(id,'cancelled');
          } else if (deps.some(dep=>['failed','skipped','cancelled'].includes(result.states.get(dep)!))) {
            transition(id,'skipped');
          } else if (active < this.concurrency && deps.every(dep=>result.states.get(dep)==='succeeded')) {
            active++;
            transition(id,'running');
            const inputs = new Map(deps.map(dep=>[dep,result.values.get(dep)]));
            Promise.resolve().then(()=>actions[id]!({inputs,signal:controller.signal})).then(
              value=>{
                if (controller.signal.aborted) transition(id,'cancelled');
                else { result.values.set(id,value); transition(id,'succeeded'); }
              },
              error=>{
                result.errors.set(id,error);
                transition(id,controller.signal.aborted?'cancelled':'failed');
              }
            ).finally(()=>{active--;schedule();});
          }
        }
        if (active === 0 && [...result.states.values()].every(state=>state!=='pending')) finish();
      };
      signal?.addEventListener('abort',cancel,{once:true});
      if (signal?.aborted) controller.abort();
      schedule();
    });
  }
}
