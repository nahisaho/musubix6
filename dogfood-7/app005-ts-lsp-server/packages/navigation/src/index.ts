import {snapshot,change} from '../../text/src/index.ts';
import type {Store,Edit,Document} from '../../text/src/index.ts';
import {parse} from '../../parser/src/index.ts';
import {analyze} from '../../symbols/src/index.ts';
import type {Symbols,Declaration} from '../../symbols/src/index.ts';
export type Location = {uri:string; start:number; end:number};
export type WorkspaceEdit = {uri:string; version:number; generation:number; edits:Edit[]};
const contains = (t:{start:number;end:number},offset:number) => t.start <= offset && offset < t.end;
function symbolAt(t:Symbols,offset:number):Declaration|null {
  const declaration = t.declarations.find(d => contains(d,offset));
  if (declaration) return declaration;
  const ref = t.references.find(r => contains(r,offset));
  return t.declarations.find(d => d.id === ref?.target) ?? null;
}
/** @id CODE-NAV-001 @implements REQ-NAV-001 REQ-NAV-002 */
export function definition(s:Store,uri:string,offset:number):Location|null {
  const d = snapshot(s,uri), symbol = symbolAt(analyze(parse(d.text)),offset);
  return symbol ? {uri,start:symbol.start,end:symbol.end} : null;
}
/** @id CODE-NAV-003 @implements REQ-NAV-003 REQ-NAV-004 REQ-NAV-005 REQ-NAV-006 REQ-NAV-008 */
export function rename(s:Store,uri:string,offset:number,name:string,version:number):WorkspaceEdit|null {
  const d = snapshot(s,uri);
  if (d.version !== version) throw new Error('stale version');
  if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name) || ['let','print'].includes(name)) throw new Error('invalid name');
  const before = analyze(parse(d.text)), symbol = symbolAt(before,offset);
  if (!symbol) return null;
  const edits = [symbol,...before.references.filter(r => r.target === symbol.id)]
    .map(t => ({start:t.start,end:t.end,text:name})).sort((a,b) => b.start-a.start);
  let text = d.text;
  for (const e of edits) text = text.slice(0,e.start)+e.text+text.slice(e.end);
  const after = analyze(parse(text));
  const mapOffset = (o:number) => o + edits.filter(e => e.end <= o).reduce((n,e) => n+e.text.length-(e.end-e.start),0);
  const targetId = mapOffset(symbol.id);
  const renamed = after.declarations.find(x => x.id === targetId)!;
  if (after.declarations.some(x => x.id !== targetId && x.scope === renamed.scope && x.name === name))
    throw new Error('rename collision');
  for (const r of before.references) {
    const actual = after.references.find(x => x.start === mapOffset(r.start));
    const expected = r.target === null ? null : mapOffset(r.target);
    if (!actual || actual.target !== expected) throw new Error('rename capture');
  }
  return {uri,version,generation:d.generation,edits};
}
/** @id CODE-NAV-007 @implements REQ-NAV-007 */
export function applyWorkspaceEdit(s:Store,e:WorkspaceEdit,newVersion:number):Document {
  const d = snapshot(s,e.uri);
  if (d.generation !== e.generation) throw new Error('stale generation');
  if (d.version !== e.version) throw new Error('stale version');
  const edits = [...e.edits].sort((a,b) => b.start-a.start);
  for (let i = 1; i < edits.length; i++)
    if (edits[i].end > edits[i-1].start) throw new Error('overlapping range');
  return change(s,e.uri,newVersion,edits);
}
