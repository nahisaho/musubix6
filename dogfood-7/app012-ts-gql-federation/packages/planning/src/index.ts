import { baseType, canonical, mergeSet, parseQuery, setSelections } from '../../shared/src/index.ts';
import type { FieldSet, Selection, Value } from '../../shared/src/index.ts';
import type { Schema } from '../../composition/src/index.ts';
export type FetchStep = {id:number;kind:'root'|'entity';service:string;type:string;path:string[];field?:string;args:Record<string,Value>;selections:Selection[];key:FieldSet;requires:FieldSet;dependsOn:number[]};
export type Plan = {steps:FetchStep[];selections:Selection[];internalPrefix:string};

/** @id CODE-PLAN-001 @implements REQ-PLAN-001 REQ-PLAN-002 REQ-PLAN-003 REQ-PLAN-004 REQ-PLAN-005 REQ-PLAN-006 REQ-PLAN-007 REQ-PLAN-008 REQ-PLAN-009 REQ-PLAN-010 REQ-PLAN-011 */
export function plan(schema:Schema,query:string,variables:Record<string,Value>={}):Plan {
  function validate(type:string,list:Selection[]):Selection[] {
    const output:Selection[]=[];
    for(const s of list){
      if(s.condition){if(s.condition===type)for(const expanded of validate(type,s.selections))add(output,expanded);continue;}
      const f=schema.types[type]?.fields[s.name];if(!f)throw Error(`unknown field ${type}.${s.name}`);
      const childType=baseType(f.type), object=!!schema.types[childType];
      if(object!==!!s.selections.length)throw Error(`invalid selection ${type}.${s.name}`);
      const result={...s,selections:object?validate(childType,s.selections):[]};
      add(output,result);
    }
    return output;
  }
  function add(list:Selection[],s:Selection):Selection {
    const old=list.find(x=>x.alias===s.alias);
    if(old){
      if(old.name!==s.name || canonical(old.args)!==canonical(s.args))throw Error(`alias conflict ${s.alias}`);
      for(const child of s.selections)add(old.selections,child);return old;
    }
    const copy={...s,selections:[] as Selection[]};list.push(copy);
    for(const child of s.selections)add(copy.selections,child);
    return copy;
  }
  const selections=validate('Query',parseQuery(query,variables));
  const aliases=new Set<string>();
  function collect(list:Selection[]){for(const s of list){aliases.add(s.alias);collect(s.selections);}}
  collect(selections);
  let internalPrefix='__fed_';
  while([...aliases].some(alias=>alias.startsWith(internalPrefix)))internalPrefix='_'+internalPrefix;
  const steps:FetchStep[]=[],groups=new Map<string,FetchStep>();
  function inject(type:string,set:FieldSet,source:FetchStep,list:Selection[],path:string[]):number[] {
    function hidden(list:Selection[]):Selection[]{return list.map(s=>({...s,alias:internalPrefix+s.name,selections:hidden(s.selections)}));}
    return hidden(setSelections(set)).flatMap(s=>route(type,s,source,list,path).map(step=>step.id));
  }
  function route(type:string,s:Selection,source:FetchStep,list:Selection[],path:string[]):FetchStep[] {
    const f=schema.types[type].fields[s.name];
    let target=source,targetList=list;
    if(f.owner!==source.service){
      const key=schema.types[type].keys[f.owner]?.[0];if(!key)throw Error(`no usable key ${type} on ${f.owner}`);
      const dependencies=[...new Set([source.id,...inject(type,key,source,list,path),...inject(type,f.requires,source,list,path)])].sort((a,b)=>a-b);
      const group=`${source.id}:${path.join('.')}:${f.owner}:${dependencies.join(',')}`;
      let remote=groups.get(group);
      if(!remote){
        remote={id:steps.length,kind:'entity',service:f.owner,type,path:[...path],args:{},selections:[],key,requires:{},dependsOn:dependencies};
        steps.push(remote);groups.set(group,remote);
      }
      target=remote;targetList=remote.selections;
      mergeSet(remote.requires,f.requires);
    }
    const local=add(targetList,{...s,selections:[]});
    return [target,...s.selections.flatMap(child=>route(baseType(f.type),child,target,local.selections,[...path,s.alias]))];
  }
  for(const selection of selections){
    const f=schema.types.Query.fields[selection.name];
    const root:FetchStep={id:steps.length,kind:'root',service:f.owner,type:baseType(f.type),path:[selection.alias],field:selection.name,args:selection.args,selections:[],key:{},requires:{},dependsOn:[]};
    steps.push(root);
    for(const s of selection.selections)route(root.type,s,root,root.selections,root.path);
  }
  return {steps,selections,internalPrefix};
}
