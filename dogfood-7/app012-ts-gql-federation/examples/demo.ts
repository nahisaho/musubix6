import { Gateway } from '../packages/gateway/src/index.ts';
import { graphs, adapters } from '../packages/shared/test-fixtures.ts';
const { services,calls }=adapters();
const gateway=new Gateway(graphs.map(graph=>({...graph,service:services[graph.name as keyof typeof services]})));
const result=await gateway.execute('{ catalog:products { title:name shipping reviews { body } } me { name } }');
console.log(JSON.stringify({result,entityBatches:calls.filter(c=>c.kind==='entities'),health:gateway.health()},null,2));
