import { ArtifactCache, buildKey, canonical, hash } from '@build/cache';
import type { Json } from '@build/cache';
import { Executor, FakeClock } from '@build/executor';
import type { Action, Execution } from '@build/executor';
import { Graph } from '@build/graph';
export interface TaskContext {inputs: Record<string,Json>;signal:AbortSignal}
export interface Task {id:string;deps:readonly string[];version:string;run:(context:TaskContext)=>Json|Promise<Json>}
export interface Artifact {value:Json;hash:string;key:string;cacheHit:boolean}
export interface BuildResult {artifacts:Record<string,Artifact>;executed:string[];reused:string[];events:Execution['events']}
export interface EngineOptions {
  concurrency?:number;clock?:FakeClock;cache?:ArtifactCache;
  artifactMetadata?:(id:string)=>Json|undefined;
  onCacheHit?:(id:string,metadata:Json|undefined)=>void;
}
export class BuildFailure extends Error {
  execution: Execution;
  constructor(execution: Execution) {
    const errors = [...execution.errors.values()].map(error=>error instanceof Error?error.message:String(error));
    super(`build failed: ${errors.join('; ') || 'cancelled'}`);
    this.name = 'BuildFailure';
    this.execution = execution;
  }
}

/** @id CODE-ENGINE-001 @implements REQ-ENGINE-001 REQ-ENGINE-002 REQ-ENGINE-003 REQ-ENGINE-004 REQ-ENGINE-005 REQ-ENGINE-006 REQ-ENGINE-007 REQ-ENGINE-008 REQ-ENGINE-009 */
export class Engine {
  private tasks: Map<string,Task>;
  private graph: Graph;
  private executor: Executor;
  private cache: ArtifactCache;
  private active = false;
  private artifactMetadata:EngineOptions['artifactMetadata'];
  private onCacheHit:EngineOptions['onCacheHit'];

  constructor(tasks: readonly Task[], options:EngineOptions = {}) {
    this.graph = new Graph(tasks);
    this.tasks = new Map(tasks.map(task=>[task.id,{...task,deps:[...task.deps]}]));
    this.executor = new Executor(options.concurrency ?? 4,options.clock ?? new FakeClock());
    this.cache = options.cache ?? new ArtifactCache();
    this.artifactMetadata=options.artifactMetadata;
    this.onCacheHit=options.onCacheHit;
  }

  update(id:string,version:string):void {
    if (this.active) throw new Error('build session active');
    const task = this.tasks.get(id);
    if (!task) throw new Error(`unknown task: ${id}`);
    this.tasks.set(id,{...task,version});
  }

  async build(targets:readonly string[],signal?:AbortSignal):Promise<BuildResult> {
    if (this.active) throw new Error('build session active');
    signal?.throwIfAborted();
    const closure = this.graph.closure(targets);
    this.active = true;
    try {
      const graph = new Graph(closure.map(id=>({id,deps:this.graph.dependencies(id)})));
      const actions: Record<string,Action> = Object.create(null) as Record<string,Action>;
      const executed: string[] = [];
      const reused: string[] = [];
      for (const id of closure) {
        const task = this.tasks.get(id)!;
        actions[id] = async ({inputs,signal:actionSignal}) => {
          const dependencies = Object.fromEntries([...inputs].map(([dep,value])=>[dep,(value as Artifact).hash]));
          const key = buildKey(id,task.version,dependencies);
          const cached = this.cache.get(key);
          if (cached.found) {
            this.onCacheHit?.(id,cached.metadata);
            reused.push(id);
            return {value:cached.value,hash:hash(cached.value),key,cacheHit:true} satisfies Artifact;
          }
          executed.push(id);
          const values = Object.fromEntries([...inputs].map(([dep,value])=>[
            dep,JSON.parse(canonical((value as Artifact).value)) as Json
          ]));
          const value = await task.run({inputs:values,signal:actionSignal});
          const outputHash = hash(value);
          actionSignal.throwIfAborted();
          this.cache.put(key,value,this.artifactMetadata?.(id));
          return {value:JSON.parse(canonical(value)) as Json,hash:outputHash,key,cacheHit:false} satisfies Artifact;
        };
      }
      const execution = await this.executor.run(graph,actions,signal);
      if ([...execution.states.values()].some(state=>state!=='succeeded')) throw new BuildFailure(execution);
      return {
        artifacts:Object.fromEntries(targets.map(id=>[id,execution.values.get(id) as Artifact])),
        executed,reused,events:execution.events
      };
    } finally {
      this.active = false;
    }
  }

}
