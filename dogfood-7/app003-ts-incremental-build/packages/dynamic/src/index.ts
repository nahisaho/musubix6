import type { Json } from '@build/cache';
import type { TaskContext, EngineOptions, BuildResult } from '@build/engine';
import { ArtifactCache, canonical } from '@build/cache';
import { Engine, BuildFailure } from '@build/engine';
import { Graph } from '@build/graph';
export interface DynamicContext extends TaskContext {read:(id:string)=>Json}
export interface DynamicTask {id:string;deps:readonly string[];version:string;run:(context:DynamicContext)=>Json|Promise<Json>}
export interface DynamicOptions extends Omit<EngineOptions,'artifactMetadata'|'onCacheHit'> {maxRounds?:number}
class Discovery extends Error {
  owner:string;
  reads:Set<string>;
  constructor(owner:string,reads:Set<string>) {
    super(`discovery required by ${owner}`);
    this.owner=owner;
    this.reads=new Set(reads);
  }
}

/** @id CODE-DYNAMIC-001 @implements REQ-DYNAMIC-001 REQ-DYNAMIC-002 REQ-DYNAMIC-003 REQ-DYNAMIC-004 REQ-DYNAMIC-005 REQ-DYNAMIC-006 REQ-DYNAMIC-007 REQ-DYNAMIC-008 REQ-DYNAMIC-009 REQ-DYNAMIC-010 */
export class DynamicEngine {
  private tasks:Map<string,DynamicTask>;
  private graph:Graph;
  private discovered=new Map<string,Set<string>>();
  private cache:ArtifactCache;
  private options:DynamicOptions;
  private maxRounds:number;
  private active=false;

  constructor(tasks:readonly DynamicTask[],options:DynamicOptions={}) {
    this.graph=new Graph(tasks);
    this.tasks=new Map(tasks.map(task=>[task.id,{...task,deps:[...new Set(task.deps)]}]));
    this.cache=options.cache ?? new ArtifactCache();
    this.options={...options};
    this.maxRounds=options.maxRounds ?? 32;
    if (!Number.isInteger(this.maxRounds) || this.maxRounds<1) throw new RangeError('retry bound must be a positive integer');
    for (const task of tasks) this.discovered.set(task.id,new Set());
  }

  dependencies(id:string):string[] {return this.graph.dependencies(id);}

  update(id:string,version:string):void {
    if(this.active)throw new Error('build session active');
    const task=this.tasks.get(id);
    if(!task)throw new Error(`unknown task: ${id}`);
    this.tasks.set(id,{...task,version});
  }

  async build(targets:readonly string[],signal?:AbortSignal):Promise<BuildResult & {rounds:number}> {
    if(this.active)throw new Error('build session active');
    this.graph.closure(targets);
    signal?.throwIfAborted();
    this.active=true;
    let candidate=new Graph(this.graph.snapshot());
    const discovery=new Map([...this.discovered].map(([id,deps])=>[id,new Set(deps)]));
    const staging=this.cache.fork();
    const attempts:string[]=[];
    try {
      for(let round=1;round<=this.maxRounds;round++){
        const observed=new Map<string,Set<string>>();
        const tasks=[...this.tasks.values()].map(task=>({
          ...task,deps:candidate.dependencies(task.id),
          run:async(context:TaskContext):Promise<Json>=>{
            attempts.push(task.id);
            const reads=new Set<string>();
            const value=await task.run({...context,read:(id:string):Json=>{
              if(!this.tasks.has(id))throw new Error(`unknown dynamic task: ${id}`);
              reads.add(id);
              if(!Object.hasOwn(context.inputs,id))throw new Discovery(task.id,reads);
              return JSON.parse(canonical(context.inputs[id])) as Json;
            }});
            observed.set(task.id,new Set([...reads].filter(id=>!task.deps.includes(id))));
            return value;
          }
        }));
        const engine=new Engine(tasks,{
          ...this.options,cache:staging,
          artifactMetadata:id=>[...observed.get(id) ?? []],
          onCacheHit:(id,metadata)=>{
            if(Array.isArray(metadata))observed.set(id,new Set(metadata as string[]));
          }
        });
        let result:BuildResult|undefined;
        const missing:Discovery[]=[];
        try{
          result=await engine.build(targets,signal);
        }catch(error){
          if(!(error instanceof BuildFailure))throw error;
          for(const cause of error.execution.errors.values()){
            if(cause instanceof Discovery)missing.push(cause);
            else throw cause;
          }
          if(missing.length===0)throw error;
        }
        for(const [id,reads] of observed)discovery.set(id,reads);
        for(const request of missing){
          const deps=discovery.get(request.owner)!;
          for(const dep of request.reads){
            if(!this.tasks.get(request.owner)!.deps.includes(dep))deps.add(dep);
          }
        }
        const next=new Graph([...this.tasks.values()].map(task=>({
          id:task.id,deps:[...task.deps,...discovery.get(task.id)!]
        })));
        const changed=canonical(candidate.snapshot())!==canonical(next.snapshot());
        candidate=next;
        if(!changed && result){
          signal?.throwIfAborted();
          this.graph=candidate;
          this.discovered=discovery;
          this.cache.publish(staging);
          return {...result,executed:attempts,rounds:round};
        }
      }

      throw new Error(`dynamic dependency stabilization exceeded ${this.maxRounds} rounds`);
    }finally{
      this.active=false;
    }
  }
}
