import {createStore,open,change,close,snapshot} from '../../text/src/index.ts';
import type {Store,Edit,Document} from '../../text/src/index.ts';
import {parse} from '../../parser/src/index.ts';
import type {Parsed,Issue} from '../../parser/src/index.ts';
import {analyze} from '../../symbols/src/index.ts';
import {definition,rename,applyWorkspaceEdit} from '../../navigation/src/index.ts';
import type {WorkspaceEdit} from '../../navigation/src/index.ts';
export type Diagnostic = Issue & {severity:1};
export type Action = {title:string; edit:WorkspaceEdit};
/** @id CODE-DIAG-009 @implements REQ-DIAG-009 */
const caches = new WeakMap<Document,{version:number;parsed:Parsed}>();
/** @id CODE-DIAG-008 @implements REQ-DIAG-008 */
function model(s:Store,uri:string) {
  const d = snapshot(s,uri);
  const record = s.documents.get(uri)!;
  const old = caches.get(record);
  const parsed = old?.version === d.version ? old.parsed : parse(d.text,old?.parsed);
  caches.set(record,{version:d.version,parsed});
  return {d,parsed,symbols:analyze(parsed)};
}
/** @id CODE-DIAG-001 @implements REQ-DIAG-001 REQ-DIAG-002 REQ-DIAG-003 REQ-DIAG-004 */
export function diagnose(s:Store,uri:string):{uri:string;version:number;generation:number;items:Diagnostic[]} {
  const {d,parsed,symbols} = model(s,uri);
  const missing = symbols.references.filter(r => r.target === null)
    .map(r => ({code:'undefined-name',message:`Undefined name ${r.name}`,start:r.start,end:r.end}));
  const items:Diagnostic[] = [...parsed.issues,...symbols.issues,...missing]
    .map(i => ({...i,severity:1 as const})).sort((a,b) => a.start-b.start || a.code.localeCompare(b.code));
  return {uri,version:d.version,generation:d.generation,items};
}
function distance(a:string,b:string):number {
  let prev = Array.from({length:b.length+1},(_,i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1] === b[j-1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}
/** @id CODE-DIAG-005 @implements REQ-DIAG-005 REQ-DIAG-006 */
export function actions(s:Store,uri:string):Action[] {
  const {d,parsed,symbols} = model(s,uri);
  const make = (title:string,edit:Edit):Action => ({
    title,edit:{uri,version:d.version,generation:d.generation,edits:[edit]}
  });
  const out = parsed.issues.filter(i => i.code === 'missing-semicolon')
    .map(i => make('Insert semicolon',{start:i.start,end:i.end,text:';'}));
  for (const r of symbols.references.filter(r => r.target === null)) {
    const candidates = symbols.declarations.filter(x => r.visible.includes(x.id) && distance(r.name,x.name) === 1);
    if (candidates.length === 1) out.push(make(`Replace with ${candidates[0].name}`,{start:r.start,end:r.end,text:candidates[0].name}));
  }
  return out.sort((a,b) => a.edit.edits[0].start-b.edit.edits[0].start);
}
/** @id CODE-DIAG-007 @implements REQ-DIAG-007 */
export function applyAction(s:Store,action:Action,newVersion:number):Document {
  return applyWorkspaceEdit(s,action.edit,newVersion);
}
export class LanguageServer {
  readonly store = createStore();
  open(uri:string,text:string,version:number) { return open(this.store,uri,text,version); }
  change(uri:string,version:number,edits:Edit[]) { return change(this.store,uri,version,edits); }
  close(uri:string) {
    return close(this.store,uri);
  }
  snapshot(uri:string) { return snapshot(this.store,uri); }
  definition(uri:string,offset:number) { return definition(this.store,uri,offset); }
  rename(uri:string,offset:number,name:string,version:number) { return rename(this.store,uri,offset,name,version); }
  diagnostics(uri:string) { return diagnose(this.store,uri); }
  actions(uri:string) { return actions(this.store,uri); }
  apply(edit:WorkspaceEdit,version:number) { return applyWorkspaceEdit(this.store,edit,version); }
}
