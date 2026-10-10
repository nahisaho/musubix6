import {canonical, clone, fingerprint, validateSchema} from '../model/index.ts';
import type {Schema} from '../model/index.ts';
import {canRead, sourceField} from '../compatibility/index.ts';
import {createCodec} from '../codec/index.ts';

export interface Step {kind: 'rename'|'promote'|'add'|'drop'|'resolve'; path: string; source?: string; default?: unknown}
export interface MigrationPlan {from: string; to: string; safe: boolean; steps: Step[]; writer: Schema; reader: Schema}

/** @id CODE-MIGRATION-001 @implements REQ-MIGRATION-001 REQ-MIGRATION-004 REQ-MIGRATION-005 */
function collect(writer: Schema, reader: Schema, path: string, steps: Step[]): void {
  if(canonical(writer)===canonical(reader)) return;
  if(typeof reader==='string' && typeof writer==='string') {
    steps.push({kind:'promote',path});
  } else if(!Array.isArray(reader) && !Array.isArray(writer) &&
    typeof reader==='object' && typeof writer==='object') {
    if(reader.type==='record' && writer.type==='record') {
      const consumed=new Set<string>();
      reader.fields.forEach(f=>{
        const old=sourceField(f,writer);
        const next=`${path}/${f.name}`;
        if(!old) { steps.push({kind:'add',path:next,default:clone(f.default)}); return; }
        consumed.add(old.name);
        if(old.name!==f.name) steps.push({kind:'rename',path:next,source:`${path}/${old.name}`});
        collect(old.type,f.type,next,steps);
      });
      writer.fields.filter(f=>!consumed.has(f.name)).forEach(f=>steps.push({kind:'drop',path:`${path}/${f.name}`}));
    } else if(reader.type==='array' && writer.type==='array') collect(writer.items,reader.items,`${path}/*`,steps);
    else if(reader.type==='map' && writer.type==='map') collect(writer.values,reader.values,`${path}/*`,steps);
    else steps.push({kind:'resolve',path});
  } else steps.push({kind:'resolve',path});
}

/** @id CODE-MIGRATION-006 @implements REQ-MIGRATION-006 REQ-MIGRATION-008 */
export function planMigration(writer: Schema, reader: Schema): MigrationPlan {
  validateSchema(writer);
  validateSchema(reader);
  const safe=canRead(reader,writer);
  const steps: Step[]=[];
  if(safe) collect(writer,reader,'',steps);
  return {from:fingerprint(writer),to:fingerprint(reader),safe,steps,writer:clone(writer),reader:clone(reader)};
}

/** @id CODE-MIGRATION-002 @implements REQ-MIGRATION-002 REQ-MIGRATION-003 REQ-MIGRATION-007 */
export function migrate(plan: MigrationPlan, datum: unknown): unknown {
  if(!plan.safe || !canRead(plan.reader,plan.writer)) throw new Error('unsafe migration');
  if(fingerprint(plan.writer)!==plan.from || fingerprint(plan.reader)!==plan.to) throw new Error('migration plan fingerprint mismatch');
  return createCodec(plan.reader).decode(createCodec(plan.writer).encode(datum),plan.writer);
}
