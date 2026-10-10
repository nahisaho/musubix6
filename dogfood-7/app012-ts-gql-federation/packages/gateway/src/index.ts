import { compose } from '../../composition/src/index.ts';
import type { Schema, Subgraph } from '../../composition/src/index.ts';
import { plan } from '../../planning/src/index.ts';
import type { Plan } from '../../planning/src/index.ts';
import { execute } from '../../execution/src/index.ts';
import type { QueryError, Service, Services, ObjectValue } from '../../execution/src/index.ts';
import { canonical } from '../../shared/src/index.ts';
import type { Value } from '../../shared/src/index.ts';
export type GatewaySubgraph = Subgraph & {service:Service};
export type GatewayResult = {data:ObjectValue|null;errors:QueryError[]};

/** @id CODE-GATE-001 @implements REQ-GATE-001 REQ-GATE-002 REQ-GATE-003 REQ-GATE-004 REQ-GATE-005 REQ-GATE-006 REQ-GATE-007 REQ-GATE-008 REQ-GATE-009 */
export class Gateway {
  private schema:Schema;
  private services:Services;
  private version=1;
  private cache=new Map<string,Plan>();
  private planBuilds=0;
  private maxPlans:number;
  constructor(subgraphs:GatewaySubgraph[],options:{maxPlans?:number}={}){
    this.maxPlans=options.maxPlans??100;
    if(!Number.isInteger(this.maxPlans)||this.maxPlans<1)throw Error('maxPlans must be a positive integer');
    this.schema=compose(subgraphs);this.services=Object.fromEntries(subgraphs.map(s=>[s.name,s.service]));
  }
  async execute(query:string,variables:Record<string,Value>={}):Promise<GatewayResult> {
    const schema=this.schema,services=this.services;
    let planned:Plan;
    try{
      const key=canonical([query,variables]);
      const cached=this.cache.get(key);
      if(cached){planned=cached;this.cache.delete(key);this.cache.set(key,cached);}
      else{
        planned=plan(schema,query,structuredClone(variables));this.planBuilds++;this.cache.set(key,planned);
        if(this.cache.size>this.maxPlans)this.cache.delete(this.cache.keys().next().value!);
      }
    }catch(error){return {data:null,errors:[{message:error instanceof Error?error.message:String(error),path:[]}]};}
    return execute(planned,services);
  }
  update(subgraphs:GatewaySubgraph[]) {
    const schema=compose(subgraphs),services=Object.fromEntries(subgraphs.map(s=>[s.name,s.service]));
    this.schema=schema;this.services=services;this.version++;this.cache.clear();
  }
  health(){return {version:this.version,subgraphs:[...this.schema.subgraphs],cachedPlans:this.cache.size,planBuilds:this.planBuilds};}
}
