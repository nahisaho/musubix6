export type FieldSet = { [field: string]: FieldSet };
export type Value = null | boolean | number | string | Value[] | { [key: string]: Value };
export type Selection = { name: string; alias: string; args: Record<string, Value>; selections: Selection[]; fragment?: string; condition?: string };

export class Reader {
  tokens: string[] = [];
  pos = 0;
  constructor(source: string) {
    const re = /\s+|#[^\n]*|,|\.\.\.|"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?|[_A-Za-z][_0-9A-Za-z]*|[!$():=@\[\]{|}]/gy;
    while (re.lastIndex < source.length) {
      const start = re.lastIndex;
      const match = re.exec(source);
      if (!match) throw Error(`syntax at ${start}`);
      if (!/^(?:\s|#|,)/.test(match[0])) this.tokens.push(match[0]);
    }
  }
  peek() { return this.tokens[this.pos]; }
  take(expected?: string): string {
    const value = this.tokens[this.pos++];
    if (value === undefined || (expected !== undefined && value !== expected)) throw Error(`syntax: expected ${expected ?? 'token'}, got ${value}`);
    return value;
  }
  eat(token: string) { if (this.peek() === token) {this.pos++;return true;} return false; }
  name() { const token=this.take(); if (!/^[_A-Za-z][_0-9A-Za-z]*$/.test(token)) throw Error(`syntax: expected name, got ${token}`); return token; }
  value(variables: Record<string, Value> = {}): Value {
    if (this.eat('$')) {
      const name=this.name(); if (!(name in variables)) throw Error(`missing variable ${name}`);return variables[name];
    }
    if (this.eat('[')) {const values:Value[]=[];while(!this.eat(']'))values.push(this.value(variables));return values;}
    if (this.eat('{')) {const values:Record<string,Value>={};while(!this.eat('}')){const key=this.name();this.take(':');values[key]=this.value(variables);}return values;}
    const token=this.take();
    if(token.startsWith('"'))return JSON.parse(token);
    if(token==='null')return null;
    if(token==='true'||token==='false')return token==='true';
    if(/^-?\d/.test(token))return Number(token);
    if(/^[_A-Za-z]/.test(token))return token;
    throw Error(`syntax: invalid value ${token}`);
  }
  args(variables: Record<string,Value> = {}) {
    const result:Record<string,Value>={};
    if(this.eat('(')){while(!this.eat(')')){const name=this.name();this.take(':');result[name]=this.value(variables);}}
    return result;
  }
  typeRef(): string {
    let value: string;
    if(this.eat('[')){value=`[${this.typeRef()}]`;this.take(']');}else value=this.name();
    if(this.eat('!'))value+='!';return value;
  }
}

export function baseType(ref:string) { return ref.replace(/[\[\]!]/g,''); }
export function fieldSet(source:string):FieldSet {
  const r=new Reader(source);
  function fields(nested:boolean):FieldSet {
    const out:FieldSet={};
    while(r.peek() && r.peek()!=='}'){const name=r.name();out[name]=r.eat('{')?fields(true):{};}
    if(nested)r.take('}');return out;
  }
  const out=fields(false);if(r.peek())throw Error('invalid fieldset');return out;
}
export function mergeSet(target:FieldSet, source:FieldSet) {
  for(const [name,sub] of Object.entries(source)){target[name]??={};mergeSet(target[name],sub);}
  return target;
}
export function canonical(value:unknown):string {
  if(value===null || typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`;
}
export function setSelections(set:FieldSet):Selection[] {
  return Object.entries(set).map(([name,sub])=>({name,alias:name,args:{},selections:setSelections(sub)}));
}
export function parseQuery(source:string, variables:Record<string,Value> = {}):Selection[] {
  const r=new Reader(source), fragments=new Map<string,{condition:string;selections:Selection[]}>();
  const vars={...variables};
  if(r.eat('query')){
    if(r.peek() && r.peek()!=='(' && r.peek()!=='{')r.name();
    if(r.eat('(')){
      while(!r.eat(')')){
        r.take('$');const name=r.name();r.take(':');const type=r.typeRef();
        if(r.eat('=')){const fallback=r.value();if(!(name in vars))vars[name]=fallback;}
        if(type.endsWith('!') && (!(name in vars)||vars[name]===null))throw Error(`missing variable ${name}`);
      }
    }
  }
  function selections():Selection[] {
    r.take('{');const list:Selection[]=[];
    while(!r.eat('}')){
      if(r.eat('...')){
        if(r.eat('on')){const condition=r.name();list.push({name:'',alias:'',args:{},condition,selections:selections()});}
        else list.push({name:'',alias:'',args:{},fragment:r.name(),selections:[]});
        continue;
      }
      const first=r.name();let name=first;
      if(r.eat(':'))name=r.name();
      const args=r.args(vars);
      list.push({name,alias:first,args,selections:r.peek()==='{'?selections():[]});
    }
    return list;
  }
  const root=selections();
  while(r.eat('fragment')){const name=r.name();r.take('on');const condition=r.name();if(fragments.has(name))throw Error(`duplicate fragment ${name}`);fragments.set(name,{condition,selections:selections()});}
  if(r.peek())throw Error(`unsupported operation ${r.peek()}`);
  function expand(list:Selection[],seen:Set<string>):Selection[] {
    return list.flatMap(selection=>{
      if(selection.fragment){
        if(seen.has(selection.fragment))throw Error('fragment cycle');
        const f=fragments.get(selection.fragment);if(!f)throw Error(`unknown fragment ${selection.fragment}`);
        return [{name:'',alias:'',args:{},condition:f.condition,selections:expand(f.selections,new Set([...seen,selection.fragment]))}];
      }
      return [{...selection,selections:expand(selection.selections,seen)}];
    });
  }
  return expand(root,new Set());
}
