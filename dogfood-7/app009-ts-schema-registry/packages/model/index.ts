import {createHash} from 'node:crypto';

export type Primitive = 'null' | 'boolean' | 'int' | 'long' | 'float' | 'double' | 'string' | 'bytes';
export interface Field {name: string; type: Schema; default?: unknown; aliases?: string[]; doc?: string}
export interface RecordSchema {type: 'record'; name: string; aliases?: string[]; fields: Field[]; doc?: string}
export interface EnumSchema {type: 'enum'; name: string; symbols: string[]; default?: string; aliases?: string[]}
export type Schema = Primitive | Schema[] | RecordSchema | EnumSchema |
  {type: 'array'; items: Schema} | {type: 'map'; values: Schema};
const primitives = new Set(['null','boolean','int','long','float','double','string','bytes']);
const namePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const own = (o: object, key: string): boolean => Object.hasOwn(o,key);
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && !Buffer.isBuffer(v);
export const clone = <T>(value: T): T => {
  if (Buffer.isBuffer(value)) return Buffer.from(value) as T;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (object(value)) return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clone(v)])) as T;
  return value;
};

/** @id CODE-MODEL-001 @implements REQ-MODEL-001 REQ-MODEL-002 REQ-MODEL-003 REQ-MODEL-006 REQ-MODEL-008 REQ-MODEL-010 */
export function validateSchema(schema: unknown): true {
  const active = new Set<object>();
  function names(v: unknown, label: string): void {
    if (!Array.isArray(v) || Array.from(v).some(n=>typeof n !== 'string' || !namePattern.test(n)) || new Set(v).size !== v.length)
      throw new Error(`schema ${label} invalid`);
  }
  function walk(s: unknown, depth: number): void {
    if(depth > 64) throw new Error('schema depth exceeded');
    if(typeof s === 'string') {
      if(!primitives.has(s)) throw new Error('schema unknown type');
      return;
    }
    if(s === null || typeof s !== 'object') throw new Error('schema invalid');
    if(active.has(s)) throw new Error('schema cycle');
    active.add(s);
    if(Array.isArray(s)) {
      if(!s.length || s.some(Array.isArray)) throw new Error('schema union invalid');
      for(const branch of s) walk(branch,depth+1);
      const tags=s.map(x=>typeof x==='string'?x:x.type==='record'||x.type==='enum'?x.name:x.type);
      if(new Set(tags).size!==tags.length) throw new Error('schema duplicate union branch');
    } else {
      const t=s as Record<string, unknown>;
      if(t.type === 'record' || t.type === 'enum') {
        if(typeof t.name !== 'string' || !namePattern.test(t.name)) throw new Error('schema name invalid');
        if(own(t,'aliases')) names(t.aliases,'aliases');
      }
      if(t.type === 'record') {
        if(!Array.isArray(t.fields)) throw new Error('schema fields invalid');
        const seen = new Set<string>();
        for(const raw of t.fields) {
          if(!object(raw) || typeof raw.name!=='string' || !namePattern.test(raw.name)) throw new Error('schema field name invalid');
          if(seen.has(raw.name)) throw new Error('schema duplicate field');
          seen.add(raw.name);
          if(own(raw,'aliases')) names(raw.aliases,'aliases');
          walk(raw.type,depth+1);
          if(own(raw,'default') && !validValue(Array.isArray(raw.type)?raw.type[0]:raw.type,raw.default)) throw new Error('schema default invalid');
        }
      } else if(t.type === 'enum') {
        names(t.symbols,'enum symbols');
        if(!(t.symbols as string[]).length || (own(t,'default') && !(t.symbols as unknown[]).includes(t.default))) throw new Error('schema enum default invalid');
      } else if(t.type === 'array') walk(t.items,depth+1);
      else if(t.type === 'map') walk(t.values,depth+1);
      else throw new Error('schema unknown type');
    }
    active.delete(s);
  }
  walk(schema,0);
  return true;
}

/** @id CODE-MODEL-004 @implements REQ-MODEL-004 REQ-MODEL-009 */
export function canonical(schema: Schema): string {
  validateSchema(schema);
  const sort = (v: unknown, datum=false): unknown => Array.isArray(v) ? v.map(x=>sort(x,datum)) :
    object(v) ? Object.fromEntries(Object.keys(v).filter(k=>datum || k!=='doc').sort()
      .map(k=>[k,sort(v[k],datum || k==='default')])) : v;
  return JSON.stringify(sort(schema));
}

/** @id CODE-MODEL-005 @implements REQ-MODEL-005 */
export function fingerprint(schema: Schema): string {
  return createHash('sha256').update(canonical(schema)).digest('hex');
}

/** @id CODE-MODEL-007 @implements REQ-MODEL-007 REQ-CODEC-009 */
export function validValue(schema: Schema, value: unknown, depth=0): boolean {
  if(depth>64) return false;
  if(Array.isArray(schema)) return schema.some(s=>validValue(s,value,depth+1));
  if(typeof schema === 'string') {
    switch(schema) {
      case 'null': return value===null;
      case 'boolean': return typeof value==='boolean';
      case 'string': return typeof value==='string';
      case 'bytes': return Buffer.isBuffer(value);
      case 'int': return typeof value==='number' && Number.isInteger(value) && value>=-2147483648 && value<=2147483647;
      case 'long': return typeof value==='number' && Number.isSafeInteger(value);
      case 'float': case 'double': return typeof value==='number' && Number.isFinite(value);
      default: return false;
    }
  }
  switch(schema.type) {
    case 'enum': return typeof value==='string' && schema.symbols.includes(value);
    case 'array': {
      if(!Array.isArray(value)) return false;
      for(let i=0;i<value.length;i++)
        if(!own(value,String(i)) || !validValue(schema.items,value[i],depth+1)) return false;
      return true;
    }
    case 'map': return object(value) && Object.values(value).every(v=>validValue(schema.values,v,depth+1));
    case 'record': return object(value) && schema.fields.every(f=>own(value,f.name)
      ? validValue(f.type,value[f.name],depth+1) : own(f,'default'));
  }
}
