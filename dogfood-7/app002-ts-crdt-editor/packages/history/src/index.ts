import { Replica } from '@crdt/causal';
import { key, type Operation } from '@crdt/sequence';
type Entry={kind:'insert'|'delete';ids:string[];tags:string[]};
export class Editor {
  readonly replica: Replica;
  #undo: Entry[]=[];
  #redo: Entry[]=[];
  constructor(actor: string){this.replica=new Replica(actor);}
  get undoDepth(): number{return this.#undo.length;}
  get redoDepth(): number{return this.#redo.length;}
  text(): string{return this.replica.text();}
  /** @id CODE-HISTORY-008 @implements REQ-HISTORY-008 */
  receive(op: Operation): boolean{return this.replica.receive(op);}
  /** @id CODE-HISTORY-007 @implements REQ-HISTORY-007 */
  #range(index:number,count:number): void {
    const length=this.replica.sequence.visibleIds().length;
    if (!Number.isSafeInteger(index)||!Number.isSafeInteger(count)||index<0||count<0||index>length||count>length-index)
      throw new RangeError('Invalid edit range');
  }
  /** @id CODE-HISTORY-001 @implements REQ-HISTORY-001 */
  insert(index:number,text:string): Operation[]{
    this.#range(index,0);
    if(typeof text!=='string')throw new TypeError('Text must be a string');
    const points=[...text];
    if(!points.length)return [];
    const ops=this.replica.atomic(points.length,r=>points.map((point,i)=>r.insert(index+i,point)));
    if(ops.length)this.#record({kind:'insert',ids:ops.map(o=>key(o.id)),tags:[]});
    return ops;
  }
  delete(index:number,count:number): Operation[]{
    this.#range(index,count);
    const ids=this.replica.sequence.visibleIds().slice(index,index+count);
    if(!ids.length)return [];
    const ops=this.replica.atomic(ids.length,r=>ids.map(id=>r.hide(id)));
    if(ops.length)this.#record({kind:'delete',ids,tags:ops.map(o=>key(o.id))});
    return ops;
  }
  /** @id CODE-HISTORY-006 @implements REQ-HISTORY-006 */
  #record(entry:Entry):void{this.#undo.push(entry);this.#redo=[];}
  /** @id CODE-HISTORY-002 @implements REQ-HISTORY-002 */
  undo(): Operation[]{
    const old=this.#undo.at(-1);if(!old)return [];
    const entry=structuredClone(old);
    const ops=this.replica.atomic(entry.ids.length,r=>entry.kind==='insert'?this.#hide(entry,r):this.#restore(entry,r));
    this.#undo.pop();
    this.#redo.push(entry);return ops;
  }
  /** @id CODE-HISTORY-003 @implements REQ-HISTORY-003 */
  redo(): Operation[]{
    const old=this.#redo.at(-1);if(!old)return [];
    const entry=structuredClone(old);
    const ops=this.replica.atomic(entry.ids.length,r=>entry.kind==='insert'?this.#restore(entry,r):this.#hide(entry,r));
    this.#redo.pop();
    this.#undo.push(entry);return ops;
  }
  /** @id CODE-HISTORY-004 @implements REQ-HISTORY-004 */
  #restore(entry:Entry,replica:Replica):Operation[]{
    const ops=entry.ids.map((id,i)=>replica.show(id,entry.tags[i]));
    entry.tags=[];return ops;
  }
  /** @id CODE-HISTORY-005 @implements REQ-HISTORY-005 */
  #hide(entry:Entry,replica:Replica):Operation[]{
    const ops=entry.ids.map(id=>replica.hide(id));
    entry.tags=ops.map(o=>key(o.id));return ops;
  }
}
