import { Sequence, key, canonical, type Operation } from '@crdt/sequence';
import { Editor } from '@crdt/history';
import { capture, type Anchor } from '@crdt/cursor';
export type Mode='insert'|'edit'|'history';
export type Report={seed:number;editors:Editor[];operations:Operation[];schedule:string[];anchors:Anchor[]};
/** @id CODE-CONVERGENCE-009 @implements REQ-CONVERGENCE-003 */
export function validateReport(report:Report):void {
  if(report.editors.length!==3)throw new Error('Replica cardinality violation');
  const expected=report.operations.map(canonical).sort();
  const nodes=report.operations.filter(o=>o.kind==='insert').map(o=>key(o.id)).sort();
  const reference=report.editors[0].replica;
  for(const editor of report.editors){
    const replica=editor.replica;
    if(JSON.stringify(replica.log.map(canonical).sort())!==JSON.stringify(expected)||
      JSON.stringify(replica.sequence.allIds().sort())!==JSON.stringify(nodes))
      throw new Error(`Operation preservation violation, seed ${report.seed}`);
    if(replica.text()!==reference.text()||
      JSON.stringify(replica.sequence.allIds())!==JSON.stringify(reference.sequence.allIds())||
      replica.pendingCount||replica.rejected.length)
      throw new Error(`Convergence violation, seed ${report.seed}`);
  }
}
export class Random{
  #state:number;
  /** @id CODE-CONVERGENCE-001 @implements REQ-CONVERGENCE-001 */
  constructor(seed:number){
    if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new RangeError('Seed must be uint32');
    this.#state=seed||0x9e3779b9;
  }
  int(bound:number):number{
    if(!Number.isInteger(bound)||bound<=0||bound>0x100000000)throw new RangeError('Bound must be positive uint32 range');
    let x=this.#state;x^=x<<13;x^=x>>>17;x^=x<<5;this.#state=x>>>0;
    return Math.floor(this.#state/0x100000000*bound);
  }
  shuffle<T>(values:T[]):T[]{
    const result=[...values];
    for(let i=result.length-1;i>0;i--){const j=this.int(i+1);[result[i],result[j]]=[result[j],result[i]];}
    return result;
  }
}
/** @id CODE-CONVERGENCE-002 @implements REQ-CONVERGENCE-002 */
export function scenario(seed:number,steps:number,mode:Mode):Report{
  if(!Number.isSafeInteger(steps)||steps<0)throw new RangeError('Invalid step count');
  if(!['insert','edit','history'].includes(mode))throw new TypeError('Invalid simulation mode');
  const random=new Random(seed),editors=['a','b','c'].map(actor=>new Editor(actor));
  const initial=editors[0].insert(0,'a😀z');
  for(const e of editors.slice(1))for(const op of initial)e.receive(op);
  const anchors=[capture(editors[0].replica.sequence,1,'left'),capture(editors[0].replica.sequence,1,'right')];
  for(let i=0;i<steps;i++)edit(random,editors[random.int(3)],mode);
  const operations=[...new Map(editors.flatMap(e=>e.replica.log).map(op=>[key(op.id),op])).values()]
    .sort((a,b)=>key(a.id)<key(b.id)?-1:key(a.id)>key(b.id)?1:0);
  const schedule=deliver(random,editors,operations);
  const report={seed,editors,operations,schedule,anchors};
  validateReport(report);return report;
}
/** @id CODE-CONVERGENCE-003 @implements REQ-CONVERGENCE-003 */
function edit(random:Random,editor:Editor,mode:Mode):void{
  const length=[...editor.text()].length,action=mode==='insert'?0:random.int(mode==='edit'?2:4);
  if(action===0){const chars=['x','y','😀','\n','\u0301'];editor.insert(random.int(length+1),chars[random.int(chars.length)]);}
  else if(action===1&&length)editor.delete(random.int(length),1);
  else if(action===2)editor.undo();
  else if(action===3)editor.redo();
}
/** @id CODE-CONVERGENCE-004 @implements REQ-CONVERGENCE-004 REQ-CONVERGENCE-006 */
function deliver(random:Random,editors:Editor[],operations:Operation[]):string[]{
  const schedule:string[]=[];
  for(const e of editors){
    const repeated=[...operations,...operations.filter((_,i)=>i%3===0)];
    for(const op of random.shuffle(repeated)){
      e.receive(op);schedule.push(`${e.replica.actor}/${key(op.id)}`);
    }
  }
  return schedule;
}
/** @id CODE-CONVERGENCE-005 @implements REQ-CONVERGENCE-005 */
export function* permutations<T>(values:T[]):Generator<T[]>{
  if(!values.length){yield [];return;}
  for(let i=0;i<values.length;i++)
    for(const rest of permutations([...values.slice(0,i),...values.slice(i+1)]))yield [values[i],...rest];
}
/** @id CODE-CONVERGENCE-007 @implements REQ-CONVERGENCE-007 */
export function deepSequence(count:number):Sequence{
  if(!Number.isSafeInteger(count)||count<0)throw new RangeError('Invalid chain length');
  const s=new Sequence();
  for(let seq=1;seq<=count;seq++)s.apply({kind:'insert',id:{actor:'deep',seq},time:seq,deps:{deep:seq-1},
    after:seq===1?'HEAD':`deep:${seq-1}`,value:'x'});
  return s;
}
