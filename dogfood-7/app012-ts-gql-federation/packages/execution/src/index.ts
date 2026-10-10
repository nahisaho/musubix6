import { BatchLoader } from '../../batching/src/index.ts';
import { canonical } from '../../shared/src/index.ts';
import type { FieldSet, Selection, Value } from '../../shared/src/index.ts';
import type { FetchStep, Plan } from '../../planning/src/index.ts';
export type ObjectValue = Record<string,unknown>;
export type Service = {
  root:(field:string,args:Record<string,Value>,selections:Selection[])=>Promise<unknown>;
  entities:(type:string,representations:ObjectValue[],selections:Selection[])=>Promise<(ObjectValue|null|Error)[]>;
};
export type Services = Record<string,Service>;
export type QueryError = {message:string;path:(string|number)[]};
export type Result = {data:ObjectValue;errors:QueryError[]};
type Located = {object:ObjectValue;path:(string|number)[]};

function parents(data:unknown,path:string[],responsePath:(string|number)[]=[]):Located[] {
  if(data==null)return [];
  if(Array.isArray(data))return data.flatMap((item,i)=>parents(item,path,[...responsePath,i]));
  if(typeof data!=='object')return [];
  if(!path.length)return [{object:data as ObjectValue,path:responsePath}];
  return parents((data as ObjectValue)[path[0]],path.slice(1),[...responsePath,path[0]]);
}
function pick(object:ObjectValue,set:FieldSet,prefix:string):ObjectValue {
  const out:ObjectValue={};
  for(const [name,sub] of Object.entries(set)){
    const value=object[prefix+name];
    out[name]=Object.keys(sub).length && value!=null?pick(value as ObjectValue,sub,prefix):value;
  }
  return out;
}
/** @id CODE-EXEC-009 @implements REQ-EXEC-009 */
function validateKey(object:ObjectValue,set:FieldSet) {
  for(const [name,sub] of Object.entries(set)){
    if(object[name]==null)throw Error(`incomplete entity key ${name}`);
    if(Object.keys(sub).length){
      if(typeof object[name]!=='object'||Array.isArray(object[name]))throw Error(`incomplete entity key ${name}`);
      validateKey(object[name] as ObjectValue,sub);
    }
  }
}
function project(value:unknown,selections:Selection[]):unknown {
  if(value==null)return null;
  if(Array.isArray(value))return value.map(item=>project(item,selections));
  const object=value as ObjectValue,out:ObjectValue={};
  for(const s of selections){const v=object[s.alias];out[s.alias]=s.selections.length?project(v,s.selections):v??null;}
  return out;
}
/** @id CODE-EXEC-001 @implements REQ-EXEC-001 REQ-EXEC-002 REQ-EXEC-003 REQ-EXEC-004 REQ-EXEC-005 REQ-EXEC-006 REQ-EXEC-007 REQ-EXEC-008 */
export async function execute(plan:Plan,services:Services):Promise<Result> {
  const data:ObjectValue={},errors:QueryError[]=[],done=new Set<number>(),pending=new Set(plan.steps);
  async function fetch(step:FetchStep) {
    const service=services[step.service];
    if(step.kind==='root'){
      try{if(!service)throw Error(`missing service ${step.service}`);data[step.path[0]]=await service.root(step.field!,structuredClone(step.args),structuredClone(step.selections));}
      catch(error){data[step.path[0]]=null;errors.push({message:error instanceof Error?error.message:String(error),path:step.path});}
      return;
    }
    const objects=parents(data,step.path);
    const loader=new BatchLoader<ObjectValue,ObjectValue|null>(async reps=>{
      if(!service)throw Error(`missing service ${step.service}`);
      return service.entities(step.type,structuredClone([...reps]),structuredClone(step.selections));
    });
    await Promise.all(objects.map(async ({object,path})=>{
      try{
        const key=pick(object,step.key,plan.internalPrefix);validateKey(key,step.key);
        const representation={__typename:step.type,...key,...pick(object,step.requires,plan.internalPrefix)};
        const result=await loader.load(representation);
        if(result)Object.assign(object,result);else for(const s of step.selections)object[s.alias]=null;
      }catch(error){
        for(const s of step.selections)object[s.alias]=null;
        errors.push({message:error instanceof Error?error.message:String(error),path});
      }
    }));
  }
  while(pending.size){
    const ready=[...pending].filter(step=>step.dependsOn.every(id=>done.has(id)));
    if(!ready.length)throw Error('cyclic or invalid query plan');
    await Promise.all(ready.map(fetch));for(const step of ready){pending.delete(step);done.add(step.id);}
  }
  errors.sort((a,b)=>canonical(a.path).localeCompare(canonical(b.path)));
  return {data:project(data,plan.selections) as ObjectValue,errors};
}
