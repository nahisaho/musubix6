import { canonical } from '../../shared/src/index.ts';
type Entry<K,V> = {key:K;id:string;promise:Promise<V>;resolve:(value:V)=>void;reject:(error:unknown)=>void};
/** @id CODE-BATCH-001 @implements REQ-BATCH-001 REQ-BATCH-002 REQ-BATCH-003 REQ-BATCH-004 REQ-BATCH-005 REQ-BATCH-006 REQ-BATCH-007 REQ-BATCH-008 */
export class BatchLoader<K,V> {
  private cache=new Map<string,Promise<V>>();
  private pending:Entry<K,V>[]=[];
  private scheduled=false;
  private max:number;
  private batch:(keys:readonly K[])=>Promise<readonly (V|Error)[]>;
  constructor(batch:(keys:readonly K[])=>Promise<readonly (V|Error)[]>, options:{maxBatchSize?:number}={}){
    this.batch=batch;this.max=options.maxBatchSize??100;
    if(!Number.isInteger(this.max)||this.max<1)throw Error('maxBatchSize must be a positive integer');
  }
  load(key:K):Promise<V> {
    const id=canonical(key),cached=this.cache.get(id);if(cached)return cached;
    let resolve!:(value:V)=>void,reject!:(error:unknown)=>void;
    const promise=new Promise<V>((res,rej)=>{resolve=res;reject=rej;});
    this.pending.push({key,id,promise,resolve,reject});this.cache.set(id,promise);
    if(!this.scheduled){this.scheduled=true;queueMicrotask(()=>{void this.dispatch();});}
    return promise;
  }
  clear(key:K){this.cache.delete(canonical(key));return this;}
  clearAll(){this.cache.clear();return this;}
  prime(key:K,value:V){const id=canonical(key);if(!this.cache.has(id))this.cache.set(id,Promise.resolve(value));return this;}
  private fail(entry:Entry<K,V>,error:unknown){
    if(this.cache.get(entry.id)===entry.promise)this.cache.delete(entry.id);
    entry.reject(error);
  }
  private async dispatch() {
    const entries=this.pending;this.pending=[];this.scheduled=false;
    await Promise.all(Array.from({length:Math.ceil(entries.length/this.max)},async(_,i)=>{
      const chunk=entries.slice(i*this.max,(i+1)*this.max);
      try{
        const values=await this.batch(chunk.map(x=>x.key));
        if(values.length!==chunk.length)throw Error('batch cardinality mismatch');
        values.forEach((value,j)=>value instanceof Error?this.fail(chunk[j],value):chunk[j].resolve(value));
      }catch(error){chunk.forEach(entry=>this.fail(entry,error));}
    }));
  }
}
