import { createHash } from 'node:crypto';
import { parseRule } from '@flags/rules';
import { SegmentGraph, type Segment } from '@flags/segments';
import { inRollout, validateVariants, type Variant } from '@flags/rollout';

export type Target = { when?: string; segment?: string; value: unknown };
export type Flag = {
  key: string; enabled: boolean; defaultValue: unknown; rules: Target[];
  rollout?: { percentage: number; value: unknown; salt?: string };
  variants?: Variant[]; salt?: string;
};
export type Snapshot = { revision: number; flags: Flag[]; segments: Segment[] };
export type Mutation =
  | { op: 'putFlag'; flag: Flag }
  | { op: 'deleteFlag'; key: string }
  | { op: 'putSegment'; segment: Segment }
  | { op: 'deleteSegment'; id: string };
export type AuditEvent = {
  revision: number; actor: string; timestamp: number; operations: Mutation[];
  previousHash: string; hash: string;
};
export type Diff = { path: string; op: 'add' | 'remove' | 'change'; before?: unknown; after?: unknown };

function assertJSON(value: unknown, active = new Set<object>()): void {
  if (value===null || typeof value==='string' || typeof value==='boolean') return;
  if (typeof value==='number' && Number.isFinite(value)) return;
  if (typeof value!=='object' || active.has(value)) throw new TypeError('invalid JSON value');
  if (!Array.isArray(value) && ![Object.prototype,null].includes(Object.getPrototypeOf(value)))
    throw new TypeError('invalid JSON object');
  active.add(value);
  for(const child of Object.values(value)) assertJSON(child,active);
  active.delete(value);
}
/** @id CODE-CTL-001 @implements REQ-CTL-008 REQ-CTL-006 */
export function canonical(value: unknown): string {
  assertJSON(value);
  const encode=(v:unknown):string=>{
    if(Array.isArray(v)) return `[${v.map(encode).join(',')}]`;
    if(v!==null && typeof v==='object') return `{${Object.keys(v).sort().map(key=>
      `${JSON.stringify(key)}:${encode((v as Record<string,unknown>)[key])}`).join(',')}}`;
    return JSON.stringify(v);
  };
  return encode(value);
}
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');

/** @id CODE-CTL-006 @implements REQ-CTL-003 REQ-CTL-009 REQ-CTL-010 */
function validateFlag(flag: Flag, segments?: Set<string>): void {
  if(!flag || typeof flag.key!=='string' || !flag.key ||
     typeof flag.enabled!=='boolean' || !Array.isArray(flag.rules)) throw new TypeError('invalid flag');
  assertJSON(flag);
  assertJSON(flag.defaultValue);
  if(flag.salt!==undefined && typeof flag.salt!=='string') throw new TypeError('invalid salt');
  for(const rule of flag.rules) {
    const hasWhen=typeof rule.when==='string', hasSegment=typeof rule.segment==='string';
    if(hasWhen===hasSegment) throw new TypeError('invalid target: exactly one when or segment required');
    if(hasWhen) parseRule(rule.when!);
    if(hasSegment && segments && !segments.has(rule.segment!)) throw new Error(`unknown segment ${rule.segment}`);
    assertJSON(rule.value);
  }
  if(flag.rollout!==undefined) {
    if(!flag.rollout || typeof flag.rollout!=='object') throw new TypeError('invalid rollout');
    inRollout(flag.key,'validation',flag.rollout.percentage,flag.rollout.salt??'');
    assertJSON(flag.rollout.value);
  }
  if(flag.variants!==undefined) validateVariants(flag.variants);
}

/** @id CODE-CTL-002 @implements REQ-CTL-003 REQ-CTL-009 REQ-CTL-010 */
export function validateSnapshot(snapshot: Snapshot): void {
  if(!Number.isSafeInteger(snapshot.revision) || snapshot.revision<0 ||
      !Array.isArray(snapshot.flags) || !Array.isArray(snapshot.segments)) throw new TypeError('invalid snapshot');
  assertJSON(snapshot);
  new SegmentGraph(snapshot.segments);
  const segments=new Set(snapshot.segments.map(segment=>segment.id)), keys=new Set<string>();
  for(const flag of snapshot.flags) {
    validateFlag(flag,segments);
    if(keys.has(flag.key)) throw new TypeError('duplicate flag');
    keys.add(flag.key);
  }
}

/** @id CODE-CTL-003 @implements REQ-CTL-001 REQ-CTL-002 REQ-CTL-003 REQ-CTL-004 REQ-CTL-005 REQ-CTL-009 REQ-CTL-010 */
export class ConfigStore {
  private state: Snapshot = {revision:0,flags:[],segments:[]};
  private events: AuditEvent[] = [];
  private clock: () => number;
  constructor(clock: () => number = Date.now) { this.clock=clock; }
  transact(expectedRevision: number, actor: string, operations: Mutation[]): Snapshot {
    if(expectedRevision!==this.state.revision) throw new Error('revision conflict');
    if(!actor || typeof actor!=='string' || !Array.isArray(operations) || !operations.length)
      throw new TypeError('invalid transaction');
    const candidate=structuredClone(this.state);
    const copied=structuredClone(operations);
    const flags=new Map(candidate.flags.map(flag=>[flag.key,flag]));
    const segments=new Map(candidate.segments.map(segment=>[segment.id,segment]));
    for(const operation of copied) {
      assertJSON(operation);
      switch(operation.op) {
        case 'putFlag':
          validateFlag(operation.flag);
          flags.set(operation.flag.key,operation.flag); break;
        case 'deleteFlag':
          if(typeof operation.key!=='string' || !operation.key) throw new TypeError('invalid flag key');
          flags.delete(operation.key); break;
        case 'putSegment': {
          const segment=operation.segment;
          const refs=[...new Set(segment.refs??[])].filter(id=>id!==segment.id);
          new SegmentGraph([segment,...refs.map(id=>({id}))]);
          segments.set(segment.id,segment); break;
        }
        case 'deleteSegment':
          if(typeof operation.id!=='string' || !operation.id) throw new TypeError('invalid segment id');
          segments.delete(operation.id); break;
        default: throw new TypeError('invalid mutation');
      }
    }
    candidate.flags=[...flags.values()].sort((a,b)=>a.key.localeCompare(b.key));
    candidate.segments=[...segments.values()].sort((a,b)=>a.id.localeCompare(b.id));
    candidate.revision++;
    validateSnapshot(candidate);
    const timestamp=this.clock();
    if(!Number.isFinite(timestamp)) throw new TypeError('invalid timestamp');
    const payload={revision:candidate.revision,actor,timestamp,operations:copied,
      previousHash:this.events.at(-1)?.hash??''};
    const event={...payload,hash:digest(payload)};
    this.state=candidate;
    this.events.push(event);
    return this.snapshot();
  }
  snapshot(): Snapshot { return structuredClone(this.state); }
  audit(): AuditEvent[] { return structuredClone(this.events); }
}

/** @id CODE-CTL-004 @implements REQ-CTL-005 REQ-CTL-006 */
export function verifyAudit(events: AuditEvent[]): boolean {
  let previousHash='', revision=0;
  try {
    for(const event of events) {
      const {hash,...payload}=event;
      if(event.revision!==++revision || event.previousHash!==previousHash || digest(payload)!==hash) return false;
      previousHash=hash;
    }
    return true;
  } catch { return false; }
}

/** @id CODE-CTL-005 @implements REQ-CTL-007 REQ-CTL-008 */
export function diffSnapshots(before: Snapshot, after: Snapshot): Diff[] {
  const result:Diff[]=[];
  for(const category of ['flags','segments'] as const) {
    const rows=(snapshot:Snapshot):Map<string,unknown>=>new Map(snapshot[category].map(item=>
      ['key' in item ? item.key : item.id,item]));
    const old=rows(before), next=rows(after);
    for(const key of [...new Set([...old.keys(),...next.keys()])].sort()) {
      const path=`${category}/${key.replaceAll('~','~0').replaceAll('/','~1')}`;
      if(!old.has(key)) result.push({path,op:'add',after:structuredClone(next.get(key))});
      else if(!next.has(key)) result.push({path,op:'remove',before:structuredClone(old.get(key))});
      else if(canonical(old.get(key))!==canonical(next.get(key)))
        result.push({path,op:'change',before:structuredClone(old.get(key)),after:structuredClone(next.get(key))});
    }
  }
  return result;
}
