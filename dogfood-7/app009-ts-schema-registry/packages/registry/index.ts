import {canonical, clone, validateSchema} from '../model/index.ts';
import type {Schema} from '../model/index.ts';
import {checkCompatibility, MODE_POLICY} from '../compatibility/index.ts';
import type {Mode} from '../compatibility/index.ts';

export interface Version {id: number; version: number; schema: Schema}
export class Registry {
  #subjects = new Map<string,Version[]>();
  #modes = new Map<string,Mode>();
  #ids = new Map<number,Schema>();
  #identities = new Map<string,number>();

  /** @id CODE-REGISTRY-008 @implements REQ-REGISTRY-008 */
  #subject(subject: string): void {
    if(typeof subject!=='string' || !subject.trim() || subject.length>255) throw new Error('invalid subject');
  }

  /** @id CODE-REGISTRY-001 @implements REQ-REGISTRY-001 REQ-REGISTRY-002 REQ-REGISTRY-003 REQ-REGISTRY-007 */
  register(subject: string, schema: Schema, options: {expectedVersion?: number} = {}): Version {
    this.#subject(subject);
    validateSchema(schema);
    const versions=this.#subjects.get(subject) ?? [];
    if(options.expectedVersion!==undefined && options.expectedVersion!==versions.length) throw new Error('version conflict');
    const identity=canonical(schema);
    const existing=versions.find(v=>canonical(v.schema)===identity);
    if(existing) return clone(existing);
    if(!checkCompatibility(schema,versions.map(v=>v.schema),this.#modes.get(subject)??'backward').compatible) throw new Error('incompatible schema');
    const id=this.#identities.get(identity) ?? this.#ids.size+1;
    const snapshot=clone(schema);
    const version={id,version:versions.length+1,schema:snapshot};
    this.#identities.set(identity,id);
    this.#ids.set(id,snapshot);
    this.#subjects.set(subject,[...versions,version]);
    return clone(version);
  }

  /** @id CODE-REGISTRY-004 @implements REQ-REGISTRY-004 */
  setMode(subject: string, mode: Mode): void {
    this.#subject(subject);
    if(!Object.hasOwn(MODE_POLICY,mode)) throw new Error('invalid mode');
    this.#modes.set(subject,mode);
  }

  /** @id CODE-REGISTRY-005 @implements REQ-REGISTRY-005 */
  history(subject: string): Version[] {
    this.#subject(subject);
    return clone(this.#subjects.get(subject)??[]);
  }

  /** @id CODE-REGISTRY-006 @implements REQ-REGISTRY-006 */
  get(subject: string, version?: number): Version {
    this.#subject(subject);
    const entries=this.#subjects.get(subject)??[];
    const result=version===undefined?entries.at(-1):entries.find(v=>v.version===version);
    if(!result) throw new Error('unknown subject/version');
    return clone(result);
  }

  byId(id: number): Schema {
    const schema=this.#ids.get(id);
    if(schema===undefined) throw new Error('unknown schema ID');
    return clone(schema);
  }
}
