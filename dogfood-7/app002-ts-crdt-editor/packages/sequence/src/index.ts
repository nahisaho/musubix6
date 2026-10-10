export type Clock = Record<string, number>;
export type Stamp = {actor: string; seq: number};
type Base = {id: Stamp; time: number; deps: Clock};
export type Operation = Base & (
  {kind:'insert'; after:string; value:string} |
  {kind:'hide'|'show'; target:string; tag:string}
);
export const HEAD = 'HEAD';
export function validActor(actor: unknown): actor is string {
  return typeof actor === 'string' && /^[A-Za-z0-9_-]+$/.test(actor) &&
    !['__proto__','constructor','prototype'].includes(actor);
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function positive(n: unknown): n is number { return Number.isSafeInteger(n) && (n as number) > 0; }
function exact(value: Record<string, unknown>, fields: string[]): boolean {
  return Object.keys(value).length === fields.length && fields.every(k=>Object.hasOwn(value,k));
}
/** @id CODE-SEQ-007 @implements REQ-SEQ-007 */
export function validateOperation(op: unknown): asserts op is Operation {
  if (!record(op) || !record(op.id) || !exact(op.id,['actor','seq']) ||
      !validActor(op.id.actor) || !positive(op.id.seq) || !positive(op.time) || !record(op.deps))
    throw new TypeError('Invalid operation identity, time or clock');
  for (const [actor,n] of Object.entries(op.deps))
    if (!validActor(actor) || !Number.isSafeInteger(n) || (n as number) < 0)
      throw new TypeError('Invalid dependency clock');
  if (op.kind === 'insert') {
    if (!exact(op,['kind','id','time','deps','after','value']) ||
        typeof op.value !== 'string' || [...op.value].length !== 1)
      throw new TypeError('Insert requires one code point');
    if (op.after !== HEAD) parseKey(op.after as string);
    if (op.after === key(op.id as Stamp)) throw new TypeError('Self-parent insertion');
  } else if (op.kind === 'hide' || op.kind === 'show') {
    if (!exact(op,['kind','id','time','deps','target','tag']))
      throw new TypeError('Invalid visibility operation');
    parseKey(op.target as string); parseKey(op.tag as string);
    if (op.kind === 'hide' && op.tag !== key(op.id as Stamp))
      throw new TypeError('Hide tag must identify its operation');
  } else throw new TypeError('Unknown operation kind');
}
export function key(id: Stamp): string { return `${id.actor}:${id.seq}`; }
export function parseKey(id: string): Stamp {
  if (typeof id !== 'string') throw new TypeError('Invalid reference ID');
  const match = /^([A-Za-z0-9_-]+):([1-9][0-9]*)$/.exec(id);
  if (!match || !validActor(match[1]) || !positive(Number(match[2])))
    throw new TypeError('Invalid reference ID');
  return {actor:match[1],seq:Number(match[2])};
}
export function canonical(op: Operation): string {
  return JSON.stringify({
    id:{actor:op.id.actor,seq:op.id.seq}, time:op.time,
    deps:Object.fromEntries(Object.entries(op.deps).sort(([a],[b])=>a<b?-1:a>b?1:0)),
    kind:op.kind, ...(op.kind === 'insert' ? {after:op.after,value:op.value} : {target:op.target,tag:op.tag})
  });
}
type Insert = Operation & {kind:'insert'};
/** @id CODE-SEQ-002 @implements REQ-SEQ-002 */
function descending(a: Insert, b: Insert): number {
  return b.time-a.time || (a.id.actor<b.id.actor?1:a.id.actor>b.id.actor?-1:0) || b.id.seq-a.id.seq;
}
export class Sequence {
  #ops = new Map<string,Operation>();
  #nodes = new Map<string,Insert>();
  #rooted = new Set<string>();
  #hidden = new Map<string,Set<string>>();
  #removed = new Map<string,Set<string>>();
  /** @id CODE-SEQ-003 @implements REQ-SEQ-003 REQ-SEQ-006 */
  apply(input: Operation): boolean {
    validateOperation(input);
    const id = key(input.id), old = this.#ops.get(id);
    if (old) {
      if (canonical(old) !== canonical(input)) throw new TypeError('Conflicting operation identity');
      return false;
    }
    let rooted = false;
    if (input.kind === 'insert') {
      let parent = input.after;
      const seen = new Set<string>([id]);
      while (parent !== HEAD && !this.#rooted.has(parent) && this.#nodes.has(parent)) {
        if (seen.has(parent)) throw new TypeError('Parent cycle');
        seen.add(parent); parent = this.#nodes.get(parent)!.after;
      }
      if (parent === id) throw new TypeError('Parent cycle');
      rooted = parent === HEAD || this.#rooted.has(parent);
    }
    const op = structuredClone(input);
    this.#ops.set(id,op);
    if (op.kind === 'insert') {
      this.#nodes.set(id,op as Insert);
      if(rooted)this.#rooted.add(id);
    }
    else {
      const map = op.kind === 'hide' ? this.#hidden : this.#removed;
      const tags = map.get(op.target) ?? new Set<string>();
      tags.add(op.tag); map.set(op.target,tags);
    }
    return true;
  }
  /** @id CODE-SEQ-004 @implements REQ-SEQ-004 */
  isVisible(id: string): boolean {
    if (!this.#nodes.has(id)) return false;
    return ![...(this.#hidden.get(id) ?? [])].some(tag => !this.#removed.get(id)?.has(tag));
  }
  /** @id CODE-SEQ-005 @implements REQ-SEQ-005 */
  activeTags(id: string): string[] {
    return [...(this.#hidden.get(id) ?? [])].filter(tag=>!this.#removed.get(id)?.has(tag)).sort();
  }
  /** @id CODE-SEQ-001 @implements REQ-SEQ-001 */
  text(): string { return this.visibleIds().map(id=>this.#nodes.get(id)!.value).join(''); }
  visibleIds(): string[] { return this.allIds().filter(id=>this.isVisible(id)); }
  allIds(): string[] {
    const children = new Map<string,Insert[]>();
    for (const op of this.#nodes.values()) {
      const group = children.get(op.after) ?? [];
      group.push(op); children.set(op.after,group);
    }
    for (const group of children.values()) group.sort(descending);
    const stack = [...(children.get(HEAD) ?? [])].reverse(), result: string[] = [];
    while (stack.length) {
      const node = stack.pop()!, id = key(node.id);
      result.push(id);
      const descendants = children.get(id) ?? [];
      for (let i=descendants.length-1;i>=0;i--) stack.push(descendants[i]);
    }
    return result;
  }
  /** @id CODE-SEQ-008 @implements REQ-SEQ-008 */
  export(): Operation[] {
    return structuredClone([...this.#ops.values()].sort((a,b)=>key(a.id)<key(b.id)?-1:key(a.id)>key(b.id)?1:0));
  }
  static from(ops: Operation[]): Sequence {
    const result = new Sequence();
    for (const op of ops) result.apply(op);
    return result;
  }
}
