import { and, fingerprint, literal, outputColumns, references, validate, type Expr, type Plan, type Scan } from '@query/algebra';
import { cost, estimate, saturate, type Catalog } from './stats.ts';

/** @id CODE-JOIN-001 @implements REQ-JOIN-001 REQ-JOIN-006 REQ-JOIN-008 */
function graph(relations: Scan[], predicates: Expr[], limit: number): { relations: Scan[]; edges: { predicate: Expr; a: number; b: number }[] } {
  if (!relations.length) throw new Error('empty join graph');
  if (!Number.isInteger(limit) || limit < 1 || limit > 12 || relations.length > limit) throw new Error('join relation limit exceeded');
  if (relations.some(r => r.kind !== 'scan')) throw new Error('join graph requires scans');
  const sorted = [...relations].sort((a, b) => a.alias < b.alias ? -1 : a.alias > b.alias ? 1 : 0);
  const combined = sorted.reduce<Plan>((left, right, i) => i === 0 ? right : { kind: 'join', left, right, predicate: literal(true) }, sorted[0]);
  validate(combined);
  const columns = new Map(sorted.flatMap((r, i) => outputColumns(r).map(c => [c, i] as const)));
  const edges = predicates.map(predicate => {
    const refs = references(predicate);
    for (const ref of refs) if (!columns.has(ref)) throw new Error(`unknown column ${ref}`);
    if (predicate.kind !== 'compare' || predicate.op !== 'eq' || predicate.left.kind !== 'column' || predicate.right.kind !== 'column' || refs.length !== 2) throw new Error('edges require two-column equality');
    const a = columns.get(refs[0])!, b = columns.get(refs[1])!;
    if (a === b) throw new Error('edge endpoints must be different relations');
    return { predicate, a: 1 << a, b: 1 << b };
  });
  return { relations: sorted, edges };
}
/** @id CODE-JOIN-002 @implements REQ-JOIN-002 REQ-JOIN-003 REQ-JOIN-004 REQ-JOIN-005 REQ-JOIN-007 */
export function reorder(relations: Scan[], predicates: Expr[], catalog: Catalog, options: { maxRelations?: number } = {}): { plan: Plan; cost: number; explored: number } {
  const { relations: sorted, edges } = graph(relations, predicates, options.maxRelations ?? 12);
  type Candidate = { plan: Plan; cost: number; key: string };
  const dp = new Map<number, Candidate>();
  let explored = 0;
  for (let i = 0; i < sorted.length; i++) {
    const plan = structuredClone(sorted[i]);
    dp.set(1 << i, { plan, cost: cost(plan, catalog), key: fingerprint(plan) });
  }
  const full = (1 << sorted.length) - 1;
  for (let mask = 1; mask <= full; mask++) {
    if (dp.has(mask)) continue;
    let best: Candidate | undefined;
    for (let leftMask = (mask - 1) & mask; leftMask; leftMask = (leftMask - 1) & mask) {
      const rightMask = mask ^ leftMask;
      if (!rightMask || leftMask > rightMask) continue;
      const left = dp.get(leftMask)!, right = dp.get(rightMask)!;
      const crossing = edges.filter(e => ((e.a & leftMask) && (e.b & rightMask)) || ((e.b & leftMask) && (e.a & rightMask))).map(e => e.predicate);
      const predicate = crossing.length === 0 ? literal(true) : crossing.length === 1 ? crossing[0] : and(...crossing);
      for (const [a, b] of [[left, right], [right, left]]) {
        const plan: Plan = { kind: 'join', left: a.plan, right: b.plan, predicate };
        const candidate = { plan, cost: saturate(a.cost + b.cost + estimate(plan, catalog)), key: fingerprint(plan) };
        explored++;
        if (!best || candidate.cost < best.cost || (candidate.cost === best.cost && candidate.key < best.key)) best = candidate;
      }
    }
    dp.set(mask, best!);
  }
  const best = dp.get(full)!;
  return { plan: best.plan, cost: best.cost, explored };
}
