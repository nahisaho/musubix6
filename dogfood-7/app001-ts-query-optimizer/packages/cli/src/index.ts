import { fingerprint, outputColumns, validate, type Expr, type Plan, type Scan } from '@query/algebra';
import { Catalog, cost, estimate, reorder, rewrite, type Statistics } from '@query/optimizer';
export type Options = { maxPasses?: number; maxRelations?: number };
export type Optimization = { plan: Plan; rows: number; cost: number; originalCost: number; applied: string[]; explored: number; catalog: Catalog };

function flatten(plan: Plan): { relations: Scan[]; predicates: Expr[] } | undefined {
  if (plan.kind === 'scan') return { relations: [plan], predicates: [] };
  if (plan.kind !== 'join') return;
  const left = flatten(plan.left), right = flatten(plan.right);
  if (!left || !right) return;
  const terms = plan.predicate.kind === 'and' ? plan.predicate.terms : [plan.predicate];
  const predicates: Expr[] = [];
  for (const term of terms) {
    if (term.kind === 'literal' && term.value === true) continue;
    if (term.kind !== 'compare' || term.op !== 'eq' || term.left.kind !== 'column' || term.right.kind !== 'column') return;
    if (term.left.name.split('.')[0] === term.right.name.split('.')[0]) return;
    predicates.push(term);
  }
  return { relations: [...left.relations, ...right.relations], predicates: [...left.predicates, ...right.predicates, ...predicates] };
}
/** @id CODE-PLAN-001 @implements REQ-PLAN-001 REQ-PLAN-002 REQ-PLAN-007 REQ-PLAN-008 */
export function optimize(plan: Plan, stats: Statistics, options: Options = {}): Optimization {
  validate(plan);
  if (options.maxRelations !== undefined && (!Number.isInteger(options.maxRelations) || options.maxRelations < 1 || options.maxRelations > 12)) throw new Error('invalid join search budget');
  const catalog = new Catalog(stats), originalCost = cost(plan, catalog);
  const normalized = rewrite(plan, options);
  let explored = 0;
  const order = (p: Plan): Plan => {
    const graph = flatten(p);
    if (graph && graph.relations.length > 1) {
      const result = reorder(graph.relations, graph.predicates, catalog, options);
      explored += result.explored;
      return result.cost <= cost(p, catalog) ? result.plan : p;
    }
    if (p.kind === 'join') return { ...p, left: order(p.left), right: order(p.right) };
    if (p.kind === 'filter' || p.kind === 'project') return { ...p, input: order(p.input) };
    return p;
  };
  let candidate = order(normalized.plan);
  if (fingerprint(outputColumns(candidate)) !== fingerprint(outputColumns(plan))) candidate = { kind: 'project', input: candidate, columns: outputColumns(plan) };
  const chosen = cost(candidate, catalog) <= originalCost ? candidate : structuredClone(plan);
  return { plan: chosen, rows: estimate(chosen, catalog), cost: cost(chosen, catalog), originalCost, applied: normalized.applied, explored, catalog };
}
export type ExplainedNode = { kind: Plan['kind']; label: string; rows: number; cost: number; children: ExplainedNode[] };
function expression(expr: Expr): string {
  switch (expr.kind) {
    case 'literal': return JSON.stringify(expr.value);
    case 'column': return expr.name;
    case 'compare': return `${expression(expr.left)} ${expr.op} ${expression(expr.right)}`;
    case 'and': case 'or': return `(${expr.terms.map(expression).join(` ${expr.kind.toUpperCase()} `)})`;
  }
}
function explainNode(plan: Plan, cat: Catalog): ExplainedNode {
  const children = plan.kind === 'join' ? [plan.left, plan.right] : plan.kind === 'scan' ? [] : [plan.input];
  const label = plan.kind === 'scan' ? `Scan ${plan.table} AS ${plan.alias}` : plan.kind === 'project' ? `Project ${plan.columns.join(', ')}` : `${plan.kind === 'join' ? 'Join' : 'Filter'} ${expression(plan.predicate)}`;
  return { kind: plan.kind, label, rows: estimate(plan, cat), cost: cost(plan, cat), children: children.map(c => explainNode(c, cat)) };
}
/** @id CODE-PLAN-003 @implements REQ-PLAN-003 */
export function printPlan(result: Optimization): string {
  const lines: string[] = [];
  const number = (n: number) => String(Number(n.toFixed(3)));
  const walk = (node: ExplainedNode, level: number): void => {
    lines.push(`${'  '.repeat(level)}${node.label} [rows=${number(node.rows)} cost=${number(node.cost)}]`);
    node.children.forEach(c => walk(c, level + 1));
  };
  walk(explainNode(result.plan, result.catalog), 0);
  return lines.join('\n');
}
/** @id CODE-PLAN-004 @implements REQ-PLAN-004 */
export function explainJSON(result: Optimization): { tree: ExplainedNode; originalCost: number; applied: string[]; explored: number } {
  return { tree: explainNode(result.plan, result.catalog), originalCost: result.originalCost, applied: [...result.applied], explored: result.explored };
}
/** @id CODE-PLAN-005 @implements REQ-PLAN-005 */
export function parseRequest(text: string): { plan: Plan; stats: Statistics } {
  let input: any;
  try { input = JSON.parse(text); } catch { throw new Error('invalid JSON request'); }
  if (!input || typeof input !== 'object' || Array.isArray(input) || !input.plan || !input.stats) throw new Error('request requires plan and stats');
  validate(input.plan);
  new Catalog(input.stats);
  return { plan: input.plan, stats: input.stats };
}
