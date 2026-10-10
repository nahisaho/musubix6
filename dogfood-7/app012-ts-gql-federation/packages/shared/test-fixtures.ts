import type { Selection } from './src/index.ts';
export const graphs=[
  {name:'products',sdl:'type Query { products: [Product] product(id: ID!): Product } type Product @key(fields:"id") { id: ID! name: String weight: Int price: Int }'},
  {name:'reviews',sdl:'extend type Product @key(fields:"id") { id: ID! @external weight: Int @external reviews: [Review] shipping: Int @requires(fields:"weight") } type Review { body: String }'},
  {name:'users',sdl:'type Query { me: User } type User { name: String }'}
];
export function select(object:Record<string,unknown>,selections:Selection[]):Record<string,unknown>{
  const out:Record<string,unknown>={};
  for(const s of selections){
    const value=object[s.name];
    out[s.alias]=s.selections.length
      ? Array.isArray(value)?value.map(x=>x==null?null:select(x,s.selections)):value==null?null:select(value as Record<string,unknown>,s.selections)
      : value??null;
  }
  return out;
}
export function adapters(){
  const calls:{service:string;kind:string;reps?:Record<string,unknown>[]}[]=[];
  const products=[{id:'1',name:'Chair',weight:4,price:10},{id:'2',name:'Table',weight:8,price:20},{id:'1',name:'Chair',weight:4,price:10}];
  const services={
    products:{
      root:async(field:string,args:Record<string,unknown>,selections:Selection[])=>{
        calls.push({service:'products',kind:'root'});
        return field==='products'?products.map(p=>select(p,selections)):select(products.find(p=>p.id===args.id)??products[0],selections);
      },
      entities:async(_type:string,reps:Record<string,unknown>[],selections:Selection[])=>reps.map(r=>{
        const p=products.find(p=>p.id===r.id);return p?select(p,selections):null;
      })
    },
    reviews:{
      root:async()=>null,
      entities:async(_type:string,reps:Record<string,unknown>[],selections:Selection[])=>{
        calls.push({service:'reviews',kind:'entities',reps});
        return reps.map(r=>select({reviews:[{body:`Review ${r.id}`}],shipping:Number(r.weight)*2},selections));
      }
    },
    users:{root:async(_field:string,_args:Record<string,unknown>,selections:Selection[])=>select({name:'Ada'},selections),entities:async()=>[]}
  };
  return {services,calls};
}
