import { and, evaluate, fingerprint, literal, outputColumns, references, validate, type Expr, type Plan } from '@query/algebra';
export type Rule = { name: string; apply: (plan: Plan) => Plan };
/** @id CODE-RULE-009 @implements REQ-RULE-009 */
const booleanResult = (expr: Expr): boolean =>
  expr.kind === 'compare' || expr.kind === 'and' || expr.kind === 'or' ||
  (expr.kind === 'literal' && (expr.value === null || typeof expr.value === 'boolean'));
/** @id CODE-RULE-001 @implements REQ-RULE-001 */
export function simplify(expr: Expr): Expr {
  if (expr.kind === 'column' || expr.kind === 'literal') return expr;
  if (expr.kind === 'compare') {
    const left = simplify(expr.left), right = simplify(expr.right);
    const result = { ...expr, left, right };
    return left.kind === 'literal' && right.kind === 'literal' ? literal(evaluate(result, {})) : result;
  }
  const kind = expr.kind;
  const terms = expr.terms.map(simplify).flatMap(e => e.kind === kind ? e.terms : [e]);
  const absorbing = kind === 'and' ? false : true;
  if (terms.some(e => e.kind === 'literal' && e.value === absorbing)) return literal(absorbing);
  const kept = terms.filter(e => !(e.kind === 'literal' && e.value === !absorbing));
  const unique = [...new Map(kept.map(e => [fingerprint(e), e])).values()];
  return unique.length === 0 ? literal(!absorbing) : unique.length === 1 && booleanResult(unique[0]) ? unique[0] : { kind, terms: unique };
}
/** @id CODE-RULE-002 @implements REQ-RULE-002 REQ-RULE-003 REQ-RULE-004 REQ-RULE-005 REQ-RULE-006 */
function normalize(plan: Plan): Plan {
  switch (plan.kind) {
    case 'scan': return plan;
    case 'project': {
      const input = normalize(plan.input);
      return fingerprint(plan.columns) === fingerprint(outputColumns(input)) ? input : { ...plan, input };
    }
    case 'join': return { ...plan, left: normalize(plan.left), right: normalize(plan.right), predicate: simplify(plan.predicate) };
    case 'filter': {
      const input = normalize(plan.input), predicate = simplify(plan.predicate);
      if (predicate.kind === 'literal' && predicate.value === true) return input;
      if (input.kind === 'filter') return { kind: 'filter', input: input.input, predicate: simplify(and(input.predicate, predicate)) };
      if (input.kind !== 'join') return { ...plan, input, predicate };
      const leftCols = new Set(outputColumns(input.left)), rightCols = new Set(outputColumns(input.right));
      const left: Expr[] = [], right: Expr[] = [], cross: Expr[] = [];
      for (const term of predicate.kind === 'and' ? predicate.terms : [predicate]) {
        const refs = references(term);
        if (refs.every(r => leftCols.has(r))) left.push(term);
        else if (refs.every(r => rightCols.has(r))) right.push(term);
        else cross.push(term);
      }
      return {
        ...input,
        left: left.length ? { kind: 'filter', input: input.left, predicate: simplify(and(...left)) } : input.left,
        right: right.length ? { kind: 'filter', input: input.right, predicate: simplify(and(...right)) } : input.right,
        predicate: simplify(and(input.predicate, ...cross))
      };
    }
  }
}
/** @id CODE-RULE-007 @implements REQ-RULE-007 REQ-RULE-008 */
export function rewrite(plan: Plan, options: { rules?: Rule[]; maxPasses?: number } = {}): { plan: Plan; applied: string[] } {
  const max = options.maxPasses ?? 32;
  if (!Number.isInteger(max) || max < 1 || max > 1000) throw new Error('invalid rewrite budget');
  validate(plan);
  let current = structuredClone(plan);
  const seen = new Set([fingerprint(current)]), applied: string[] = [];
  const rules = options.rules ?? [{ name: 'normalize', apply: normalize }];
  for (let pass = 0; pass < max; pass++) {
    const before = fingerprint(current);
    for (const rule of rules) {
      const next = rule.apply(structuredClone(current));
      validate(next);
      if (fingerprint(next) !== fingerprint(current)) applied.push(rule.name);
      current = next;
    }
    const key = fingerprint(current);
    if (key === before) return { plan: current, applied };
    if (seen.has(key)) throw new Error('rewrite cycle detected');
    seen.add(key);
  }
  throw new Error('rewrite budget exhausted');
}
