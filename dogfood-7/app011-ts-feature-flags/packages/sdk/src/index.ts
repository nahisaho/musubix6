import { parseRule, evaluateRule, type Rule } from '@flags/rules';
import { SegmentGraph } from '@flags/segments';
import { bucket, inRollout, chooseVariant } from '@flags/rollout';
import { validateSnapshot, type Snapshot, type Flag } from '@flags/control';
export type Context = { key: string; attributes?: Record<string, unknown> };
export type Evaluation = { value: unknown; reason: string; revision: number };
type CompiledFlag = { flag: Flag; rules: (Rule | undefined)[] };

/** @id CODE-SDK-001 @implements REQ-SDK-001 REQ-SDK-002 REQ-SDK-003 REQ-SDK-004 REQ-SDK-005 REQ-SDK-006 REQ-SDK-007 REQ-SDK-008 REQ-SDK-009 REQ-SDK-010 */
export class Evaluator {
  private active: Snapshot;
  private flags = new Map<string, CompiledFlag>();
  private segments: SegmentGraph;
  private installedAt: number;
  private clock: () => number;
  private maxAge: number;
  constructor(snapshot: Snapshot, options: { clock?: () => number; maxAge?: number } = {}) {
    this.clock=options.clock??Date.now;
    this.maxAge=options.maxAge??Infinity;
    if(Number.isNaN(this.maxAge) || this.maxAge<0) throw new RangeError('invalid maxAge');
    const compiled=this.compile(snapshot);
    this.active=compiled.snapshot; this.flags=compiled.flags; this.segments=compiled.segments;
    this.installedAt=this.timestamp();
  }
  private timestamp(): number {
    const timestamp=this.clock();
    if(!Number.isFinite(timestamp)) throw new TypeError('invalid clock timestamp');
    return timestamp;
  }
  private compile(input: Snapshot) {
    const snapshot=structuredClone(input);
    validateSnapshot(snapshot);
    const segments=new SegmentGraph(snapshot.segments);
    const flags=new Map(snapshot.flags.map(flag=>[flag.key,{flag,rules:flag.rules.map(rule=>
      rule.when!==undefined?parseRule(rule.when):undefined)}]));
    return {snapshot,segments,flags};
  }
  update(input: Snapshot): void {
    if(input.revision<=this.active.revision) throw new Error('snapshot revision must increase');
    const compiled=this.compile(input);
    const installedAt=this.timestamp();
    this.active=compiled.snapshot; this.flags=compiled.flags; this.segments=compiled.segments;
    this.installedAt=installedAt;
  }
  evaluate(key: string, context: Context, fallback: unknown): Evaluation {
    const finish=(value:unknown,reason:string):Evaluation=>({
      value:structuredClone(value),reason,revision:this.active.revision});
    if(!context || typeof context.key!=='string' || !context.key) return finish(fallback,'invalid-context');
    try {
      if(this.timestamp()-this.installedAt>this.maxAge) return finish(fallback,'stale');
    } catch { return finish(fallback,'error'); }
    const compiled=this.flags.get(key);
    if(!compiled) return finish(fallback,'missing');
    const {flag,rules}=compiled;
    if(!flag.enabled) return finish(fallback,'disabled');
    try {
      const attributes=context.attributes??{};
      for(let index=0;index<flag.rules.length;index++) {
        const target=flag.rules[index], ast=rules[index];
        if(ast?evaluateRule(ast,attributes):this.segments.has(target.segment!,context.key,attributes))
          return finish(target.value,'rule');
      }
      if(flag.rollout && inRollout(flag.key,context.key,flag.rollout.percentage,flag.rollout.salt??''))
        return finish(flag.rollout.value,'rollout');
      if(flag.variants) return finish(chooseVariant(bucket(flag.key,context.key,flag.salt??''),flag.variants).value,'variant');
      return finish(flag.defaultValue,'default');
    } catch { return finish(fallback,'error'); }
  }
}
