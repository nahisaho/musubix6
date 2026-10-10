import { parseRule, evaluateRule, type Rule } from '@flags/rules';
export type Segment = { id: string; include?: string[]; exclude?: string[]; rules?: string[]; refs?: string[] };
type Compiled = { include: Set<string>; exclude: Set<string>; rules: Rule[]; refs: string[] };

/** @id CODE-SEG-001 @implements REQ-SEG-001 REQ-SEG-002 REQ-SEG-003 REQ-SEG-004 REQ-SEG-005 REQ-SEG-006 REQ-SEG-007 REQ-SEG-008 REQ-SEG-009 */
export class SegmentGraph {
  private nodes = new Map<string, Compiled>();
  constructor(definitions: Segment[]) {
    if (!Array.isArray(definitions) || definitions.length>256) throw new RangeError('segment graph limit');
    for(const def of structuredClone(definitions)) {
      if(typeof def.id!=='string' || !def.id) throw new TypeError('invalid segment id');
      if(this.nodes.has(def.id)) throw new Error(`duplicate segment ${def.id}`);
      for(const list of [def.include??[],def.exclude??[],def.refs??[],def.rules??[]])
        if(!Array.isArray(list) || !list.every(v=>typeof v==='string')) throw new TypeError('invalid segment list');
      this.nodes.set(def.id,{include:new Set(def.include),exclude:new Set(def.exclude),
        rules:(def.rules??[]).map(parseRule),refs:def.refs??[]});
    }
    const active=new Set<string>(), complete=new Set<string>();
    const visit=(id:string):void=>{
      if(active.has(id)) throw new Error(`segment cycle ${id}`);
      if(complete.has(id)) return;
      const node=this.nodes.get(id);
      if(!node) throw new Error(`unknown segment ${id}`);
      active.add(id);
      for(const ref of node.refs) visit(ref);
      active.delete(id); complete.add(id);
    };
    for(const id of this.nodes.keys()) visit(id);
  }
  has(id: string, user: string, context: Record<string, unknown>): boolean {
    const cache=new Map<string,boolean>();
    const visit=(key:string):boolean=>{
      if(cache.has(key)) return cache.get(key)!;
      const node=this.nodes.get(key);
      const result=!!node && !node.exclude.has(user) && (
        node.include.has(user) || node.rules.some(rule=>evaluateRule(rule,context)) || node.refs.some(visit));
      cache.set(key,result); return result;
    };
    return visit(id);
  }
}
