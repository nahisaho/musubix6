import {validateSchema, own} from '../model/index.ts';
import type {Schema, Field, RecordSchema} from '../model/index.ts';

export const MODE_POLICY = {
  none: {backward:false,forward:false,transitive:false},
  backward: {backward:true,forward:false,transitive:false},
  forward: {backward:false,forward:true,transitive:false},
  full: {backward:true,forward:true,transitive:false},
  'backward-transitive': {backward:true,forward:false,transitive:true},
  'forward-transitive': {backward:false,forward:true,transitive:true},
  'full-transitive': {backward:true,forward:true,transitive:true}
} as const;
export type Mode = keyof typeof MODE_POLICY;

/** @id CODE-COMPATIBILITY-004 @implements REQ-COMPATIBILITY-004 */
export function sourceField(reader: Field, writer: RecordSchema): Field | undefined {
  const exact=writer.fields.find(f=>f.name===reader.name);
  if(exact) return exact;
  const aliases=writer.fields.filter(f=>reader.aliases?.includes(f.name));
  if(aliases.length>1) throw new Error('ambiguous field alias');
  return aliases[0];
}

const promotion: Record<string,string[]> = {
  int:['long','float','double'],long:['float','double'],float:['double']
};

/** @id CODE-COMPATIBILITY-001 @implements REQ-COMPATIBILITY-001 REQ-COMPATIBILITY-002 REQ-COMPATIBILITY-003 REQ-COMPATIBILITY-005 REQ-COMPATIBILITY-006 */
export function canRead(reader: Schema, writer: Schema): boolean {
  validateSchema(reader);
  validateSchema(writer);
  function resolve(r: Schema,w: Schema): boolean {
    if(Array.isArray(w)) return w.every(branch=>resolve(r,branch));
    if(Array.isArray(r)) return r.some(branch=>resolve(branch,w));
    if(typeof r==='string' || typeof w==='string')
      return typeof r==='string' && typeof w==='string' && (r===w || !!promotion[w]?.includes(r));
    if(r.type!==w.type) return false;
    if(r.type==='array' && w.type==='array') return resolve(r.items,w.items);
    if(r.type==='map' && w.type==='map') return resolve(r.values,w.values);
    if((r.type==='record' || r.type==='enum') && (w.type==='record' || w.type==='enum') &&
      r.name!==w.name && !r.aliases?.includes(w.name)) return false;
    if(r.type==='enum' && w.type==='enum') return w.symbols.every(s=>r.symbols.includes(s) || own(r,'default'));
    if(r.type==='record' && w.type==='record') {
      return r.fields.every(f=>{
        try {
          const from=sourceField(f,w);
          return from ? resolve(f.type,from.type) : own(f,'default');
        } catch { return false; }
      });
    }
    return false;
  }
  return resolve(reader,writer);
}

/** @id CODE-COMPATIBILITY-007 @implements REQ-COMPATIBILITY-007 REQ-COMPATIBILITY-008 */
export function checkCompatibility(next: Schema, history: Schema[], mode: Mode = 'backward'):
  {compatible: boolean; issues: {version: number; direction: string}[]} {
  if(!own(MODE_POLICY,mode)) throw new Error('invalid compatibility mode');
  validateSchema(next);
  history.forEach(validateSchema);
  const policy=MODE_POLICY[mode];
  const selected=policy.transitive ? history : history.slice(-1);
  const offset=history.length-selected.length;
  const issues: {version: number; direction: string}[]=[];
  selected.forEach((old,i)=>{
    if(policy.backward && !canRead(next,old)) issues.push({version:offset+i+1,direction:'backward'});
    if(policy.forward && !canRead(old,next)) issues.push({version:offset+i+1,direction:'forward'});
  });
  return {compatible:issues.length===0,issues};
}
