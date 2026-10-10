import { createHash } from 'node:crypto';

export type Json = null | boolean | number | string | Json[] | {[key: string]: Json};
export type Lookup = {found:false} | {found:true; value:Json; metadata?:Json};

/** @id CODE-CACHE-001 @implements REQ-CACHE-001 REQ-CACHE-002 REQ-CACHE-003 REQ-CACHE-009 */
export function canonical(value: unknown, ancestors = new Set<object>()): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('number must be finite');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new TypeError('unsupported JSON value');
  if (ancestors.has(value)) throw new TypeError('cycle in JSON value');
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new TypeError('unsupported object prototype');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for(let i=0;i<value.length;i++) {
        if(!Object.hasOwn(value,i)) throw new TypeError('sparse arrays are unsupported');
      }
      return `[${value.map(item => canonical(item, ancestors)).join(',')}]`;
    }
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key], ancestors)}`).join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function hash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function copy(value: Json): Json {
  return JSON.parse(canonical(value)) as Json;
}

/** @id CODE-CACHE-007 @implements REQ-CACHE-007 */
export function buildKey(id: string, version: string, dependencies: Record<string, string>): string {
  return hash([id,version,Object.keys(dependencies).sort().map(dep => [dep,dependencies[dep]])]);
}

/** @id CODE-CACHE-004 @implements REQ-CACHE-004 REQ-CACHE-005 REQ-CACHE-006 REQ-CACHE-008 */
export class ArtifactCache {
  private entries = new Map<string, {value:Json;metadata?:Json}>();
  private hits = 0;
  private misses = 0;
  readonly capacity: number;

  constructor(capacity = 1024) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError('capacity must be a positive integer');
    this.capacity = capacity;
  }

  /** @id CODE-CACHE-010 @implements REQ-CACHE-010 */
  put(key: string, value: Json, metadata?: Json): void {
    const entry: {value:Json;metadata?:Json} = {value:copy(value)};
    if(metadata!==undefined)entry.metadata=copy(metadata);
    this.entries.delete(key);
    this.entries.set(key, entry);
    if (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
  }

  get(key: string): Lookup {
    if (!this.entries.has(key)) {
      this.misses++;
      return {found:false};
    }
    this.hits++;
    const entry = this.entries.get(key)!;
    this.entries.delete(key);
    this.entries.set(key,entry);
    return {found:true,...copy(entry) as {value:Json;metadata?:Json}};
  }

  delete(key: string): boolean { return this.entries.delete(key); }

  stats(): {size:number; hits:number; misses:number} {
    return {size:this.entries.size,hits:this.hits,misses:this.misses};
  }

  clear(): void {
    this.entries.clear();
    this.hits = 0;
    this.misses = 0;
  }

  fork(): ArtifactCache {
    const copy = new ArtifactCache(this.capacity);
    for (const [key,entry] of this.entries) copy.put(key,entry.value,entry.metadata);
    return copy;
  }

  publish(staging: ArtifactCache): void {
    for(const [key,entry] of staging.entries)this.put(key,entry.value,entry.metadata);
  }
}
