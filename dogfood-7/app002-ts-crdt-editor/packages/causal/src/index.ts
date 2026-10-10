import { Sequence, HEAD, key, parseKey, validActor, validateOperation, canonical, type Clock, type Operation } from '@crdt/sequence';
type Payload = {kind:'insert';after:string;value:string} | {kind:'hide'|'show';target:string;tag:string};
export class Replica {
  readonly sequence = new Sequence();
  readonly actor: string;
  #clock: Clock = Object.create(null) as Clock;
  #time = 0;
  #staging = false;
  #known = new Map<string,Operation>();
  #pending = new Map<string,Operation>();
  #rejected: {operation:Operation;reason:string}[] = [];
  /** @id CODE-CAUSAL-008 @implements REQ-CAUSAL-008 */
  constructor(actor: string) {
    if (!validActor(actor)) throw new TypeError('Invalid actor');
    this.actor = actor;
  }
  /** @id CODE-CAUSAL-006 @implements REQ-CAUSAL-006 */
  get clock(): Clock { return {...this.#clock}; }
  get log(): Operation[] { return this.sequence.export(); }
  get pendingCount(): number { return this.#pending.size; }
  get rejected(): {operation:Operation;reason:string}[] { return structuredClone(this.#rejected); }
  text(): string { return this.sequence.text(); }
  /** @id CODE-CAUSAL-005 @implements REQ-CAUSAL-005 */
  #validateCausal(op: Operation): void {
    validateOperation(op);
    if ((Object.hasOwn(op.deps,op.id.actor) ? op.deps[op.id.actor] : 0) !== op.id.seq-1)
      throw new TypeError('Noncontiguous own dependency');
    const refs = op.kind === 'insert' ? (op.after === HEAD ? [] : [op.after]) :
      op.kind === 'hide' ? [op.target] : [op.target,op.tag];
    for (const ref of refs) {
      const id = parseKey(ref);
      if ((Object.hasOwn(op.deps,id.actor) ? op.deps[id.actor] : 0) < id.seq)
        throw new TypeError('Reference lacks causal proof');
    }
  }
  #validateReady(op: Operation): void {
    for (const [actor,seq] of Object.entries(op.deps)) {
      if (!seq) continue;
      const previous = this.#known.get(key({actor,seq}));
      if (!previous || previous.time >= op.time) throw new TypeError('Invalid Lamport time');
    }
    const refs = op.kind === 'insert' ? (op.after === HEAD ? [] : [op.after]) : [op.target];
    for (const ref of refs)
      if (this.#known.get(ref)?.kind !== 'insert') throw new TypeError('Reference is not an insert');
    if (op.kind === 'show') {
      const hide = this.#known.get(op.tag);
      if (hide?.kind !== 'hide' || hide.target !== op.target) throw new TypeError('Tag is not a hide of target');
    }
  }
  /** @id CODE-CAUSAL-003 @implements REQ-CAUSAL-003 */
  #ready(op: Operation): boolean {
    return (this.#clock[op.id.actor] ?? 0)+1 === op.id.seq &&
      Object.entries(op.deps).every(([actor,n])=>(this.#clock[actor] ?? 0)>=n);
  }
  #deliver(op: Operation): void {
    this.sequence.apply(op);
    this.#clock[op.id.actor]=op.id.seq;
    this.#time=Math.max(this.#time,op.time);
  }
  /** @id CODE-CAUSAL-002 @implements REQ-CAUSAL-002 */
  #drain(): void {
    let progress = true;
    while (progress) {
      progress = false;
      for (const [id,op] of this.#pending) {
        if (!this.#ready(op)) continue;
        this.#pending.delete(id);
        try { this.#validateReady(op); this.#deliver(op); }
        catch (error) { this.#rejected.push({operation:op,reason:String(error)}); }
        progress = true;
      }
    }
  }
  /** @id CODE-CAUSAL-004 @implements REQ-CAUSAL-004 */
  receive(input: Operation): boolean {
    this.#validateCausal(input);
    const id=key(input.id), old=this.#known.get(id);
    if (old) {
      if (canonical(old)!==canonical(input)) throw new TypeError('Conflicting operation identity');
      return false;
    }
    const op=structuredClone(input);
    if (this.#ready(op)) {
      this.#validateReady(op);
      this.#deliver(op);
      this.#known.set(id,op);
      if(!this.#staging)this.#drain();
    } else {
      this.#known.set(id,op); this.#pending.set(id,op);
    }
    return true;
  }
  /** @id CODE-CAUSAL-001 @implements REQ-CAUSAL-001 */
  #local(payload: Payload): Operation {
    this.assertCapacity(1);
    const op: Operation={...payload,id:{actor:this.actor,seq:(this.#clock[this.actor] ?? 0)+1},
      time:this.#time+1,deps:this.clock};
    this.receive(op);
    return structuredClone(op);
  }
  assertCapacity(count:number):void {
    if(!Number.isSafeInteger(count)||count<0||
      !Number.isSafeInteger((this.#clock[this.actor] ?? 0)+count)||!Number.isSafeInteger(this.#time+count))
      throw new RangeError('Operation counter or Lamport time exhausted');
  }
  /** @id CODE-CAUSAL-009 @implements REQ-CAUSAL-008 REQ-HISTORY-007 */
  atomic<T>(count:number,action:(replica:Replica)=>T):T {
    this.assertCapacity(count);
    const staged=new Replica(this.actor);
    for(const op of this.sequence.export())staged.sequence.apply(op);
    staged.#clock=Object.assign(Object.create(null),this.#clock) as Clock;
    staged.#time=this.#time;
    staged.#known=structuredClone(this.#known);
    staged.#pending=structuredClone(this.#pending);
    staged.#rejected=structuredClone(this.#rejected);
    staged.#staging=true;
    const result=action(staged);
    staged.#staging=false;staged.#drain();
    for(const op of staged.sequence.export())this.sequence.apply(op);
    this.#clock=Object.assign(Object.create(null),staged.#clock) as Clock;
    this.#time=staged.#time;
    this.#known=structuredClone(staged.#known);
    this.#pending=structuredClone(staged.#pending);
    this.#rejected=structuredClone(staged.#rejected);
    return result;
  }
  /** @id CODE-CAUSAL-007 @implements REQ-CAUSAL-007 */
  insert(index: number,value: string): Operation {
    const ids=this.sequence.visibleIds();
    if (!Number.isInteger(index) || index<0 || index>ids.length) throw new RangeError('Invalid insert index');
    return this.#local({kind:'insert',after:index===0?HEAD:ids[index-1],value});
  }
  delete(index: number): Operation {
    const ids=this.sequence.visibleIds();
    if (!Number.isInteger(index) || index<0 || index>=ids.length) throw new RangeError('Invalid delete index');
    return this.hide(ids[index]);
  }
  hide(target: string): Operation {
    return this.#local({kind:'hide',target,tag:key({actor:this.actor,seq:(this.#clock[this.actor] ?? 0)+1})});
  }
  show(target: string,tag: string): Operation { return this.#local({kind:'show',target,tag}); }
}
