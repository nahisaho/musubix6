import type {Parsed,Token,Issue} from '../../parser/src/index.ts';
export type Declaration = Token & {id:number; scope:number};
export type Reference = Token & {target:number|null; scope:number; visible:number[]};
export type Scope = {id:number; parent:number|null; start:number; end:number};
export type Symbols = {declarations:Declaration[]; references:Reference[]; scopes:Scope[]; issues:Issue[]};
/** @id CODE-SYMBOLS-001 @implements REQ-SYMBOLS-001 REQ-SYMBOLS-002 REQ-SYMBOLS-003 REQ-SYMBOLS-004 REQ-SYMBOLS-005 REQ-SYMBOLS-006 REQ-SYMBOLS-007 REQ-SYMBOLS-008 */
export function analyze(parsed:Parsed):Symbols {
  const scopes:Scope[] = [{id:0,parent:null,start:0,end:parsed.text.length}];
  const frames:{scope:number; bindings:Map<string,Declaration>}[] = [{scope:0,bindings:new Map()}];
  const declarations:Declaration[] = [], references:Reference[] = [], issues:Issue[] = [];
  for (const node of parsed.nodes) {
    if (node.kind === 'open') {
      const id = scopes.length;
      scopes.push({id,parent:frames.at(-1)!.scope,start:node.start,end:parsed.text.length});
      frames.push({scope:id,bindings:new Map()}); continue;
    }
    if (node.kind === 'close') {
      if (frames.length === 1) issues.push({code:'scope',start:node.start,end:node.end,message:'Unexpected closing brace'});
      else scopes[frames.pop()!.scope].end = node.end;
      continue;
    }
    const frame = frames.at(-1)!;
    const visible = new Map<string,Declaration>();
    for (let i = frames.length-1; i >= 0; i--)
      for (const [name,d] of frames[i].bindings) if (!visible.has(name)) visible.set(name,d);
    for (const ref of node.refs) references.push({...ref,scope:frame.scope,target:visible.get(ref.name)?.id ?? null,
      visible:[...visible.values()].map(d => d.id)});
    if (node.name && !node.issues.some(i => i.code === 'syntax')) {
      const d = {...node.name,id:node.name.start,scope:frame.scope};
      declarations.push(d);
      if (frame.bindings.has(d.name)) issues.push({code:'duplicate-name',start:d.start,end:d.end,message:`Duplicate name ${d.name}`});
      else frame.bindings.set(d.name,d);
    }
  }
  for (const frame of frames.slice(1)) {
    const scope = scopes[frame.scope];
    issues.push({code:'scope',start:scope.start,end:scope.start+1,message:'Unclosed block'});
  }
  return {declarations,references,scopes,issues};
}
