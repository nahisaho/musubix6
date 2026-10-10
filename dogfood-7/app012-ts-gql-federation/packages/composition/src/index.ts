import { Reader, baseType, fieldSet } from '../../shared/src/index.ts';
import type { FieldSet } from '../../shared/src/index.ts';
export type Subgraph = { name:string; sdl:string };
export type Field = { type:string; owner:string; external:boolean; shareable:boolean; requires:FieldSet };
export type Type = { fields:Record<string,Field>; keys:Record<string,FieldSet[]> };
export type Schema = { types:Record<string,Type>; subgraphs:string[] };

function directives(r:Reader):Record<string,Record<string,unknown>[]> {
  const out:Record<string,Record<string,unknown>[]>={};
  while(r.eat('@')){const name=r.name();(out[name]??=[]).push(r.args());}
  return out;
}
/** @id CODE-COMP-001 @implements REQ-COMP-001 REQ-COMP-002 REQ-COMP-003 REQ-COMP-004 REQ-COMP-005 REQ-COMP-006 REQ-COMP-007 REQ-COMP-008 */
export function compose(subgraphs:Subgraph[]):Schema {
  const types:Record<string,Type>={}, names=new Set<string>();
  for(const graph of subgraphs){
    if(!graph.name || names.has(graph.name))throw Error(`duplicate subgraph ${graph.name}`);names.add(graph.name);
    const r=new Reader(graph.sdl);
    while(r.peek()){
      r.eat('extend');
      if(r.eat('scalar')){r.name();directives(r);continue;}
      r.take('type');const name=r.name(), ds=directives(r);
      const type=types[name]??={fields:{},keys:{}};
      for(const key of ds.key??[]){
        if(typeof key.fields!=='string')throw Error('key needs fields');
        (type.keys[graph.name]??=[]).push(fieldSet(key.fields));
      }
      r.take('{');
      while(!r.eat('}')){
        const field=r.name();
        if(r.eat('(')){while(!r.eat(')')){r.name();r.take(':');r.typeRef();if(r.eat('='))r.value();}}
        r.take(':');const ref=r.typeRef(), d=directives(r);
        const incoming:Field={type:ref,owner:graph.name,external:!!d.external,shareable:!!(d.shareable||ds.shareable),requires:fieldSet(String(d.requires?.[0]?.fields??''))};
        const existing=type.fields[field];
        if(existing){
          if(existing.type!==ref)throw Error(`type conflict ${name}.${field}`);
          if(!existing.external && !incoming.external && !(existing.shareable&&incoming.shareable))throw Error(`owner conflict ${name}.${field}`);
          if(existing.external&&!incoming.external)type.fields[field]=incoming;
        }else type.fields[field]=incoming;
      }
    }
  }
  function validateSet(typeName:string,set:FieldSet) {
    for(const [name,sub] of Object.entries(set)){
      const field=types[typeName]?.fields[name];if(!field)throw Error(`unknown field ${typeName}.${name}`);
      if(Object.keys(sub).length)validateSet(baseType(field.type),sub);
    }
  }
  for(const [name,type] of Object.entries(types)){
    for(const keys of Object.values(type.keys))for(const key of keys){if(!Object.keys(key).length)throw Error('empty key');validateSet(name,key);}
    const owners=new Set(Object.values(type.fields).filter(f=>!f.external).map(f=>f.owner));
    if(name!=='Query' && owners.size>1)for(const owner of owners)if(!type.keys[owner]?.length)throw Error(`no usable key ${name} on ${owner}`);
    for(const [field,f] of Object.entries(type.fields)){if(f.external)throw Error(`unresolved external ${name}.${field}`);validateSet(name,f.requires);}
    const visiting=new Set<string>(),visited=new Set<string>();
    function visit(field:string){
      if(visiting.has(field))throw Error(`requires cycle ${name}.${field}`);
      if(visited.has(field))return;visiting.add(field);
      for(const dependency of Object.keys(type.fields[field].requires))visit(dependency);
      visiting.delete(field);visited.add(field);
    }
    for(const field of Object.keys(type.fields))visit(field);
  }
  return {types,subgraphs:[...names]};
}
