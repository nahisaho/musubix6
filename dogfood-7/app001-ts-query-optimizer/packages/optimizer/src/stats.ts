import { evaluate, type Expr, type Plan } from '@query/algebra';
export type ColumnStats = { distinct: number; nullFraction?: number };
export type RelationStats = { rows: number; columns: Record<string, ColumnStats> };
export type Statistics = Record<string, RelationStats>;
const MAX = Number.MAX_SAFE_INTEGER;
export const saturate = (n: number): number => Math.max(0, Math.min(MAX, n));
/** @id CODE-STAT-009 @implements REQ-STAT-009 */
const nullFraction = (col: ColumnStats): number => col.nullFraction === undefined ? 0 : col.nullFraction;
/** @id CODE-STAT-001 @implements REQ-STAT-001 REQ-STAT-008 */
export class Catalog {
  private readonly data: Statistics;
  constructor(data: Statistics) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid statistics');
    const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX;
    for (const stat of Object.values(data)) {
      if (!stat || !finite(stat.rows)) throw new Error('invalid rows');
      if (!stat.columns || typeof stat.columns !== 'object' || Array.isArray(stat.columns)) throw new Error('invalid columns statistics');
      for (const col of Object.values(stat.columns)) {
        if (!col || !finite(col.distinct) || col.distinct > stat.rows) throw new Error('invalid distinct');
        const nf = nullFraction(col);
        if (!finite(nf) || nf > 1 || (col.distinct === 0 && stat.rows !== 0 && nf !== 1)) throw new Error('invalid null fraction/distinct');
      }
    }
    this.data = structuredClone(data);
    for (const stat of Object.values(this.data)) {
      for (const col of Object.values(stat.columns)) Object.freeze(col);
      Object.freeze(stat.columns); Object.freeze(stat);
    }
    Object.freeze(this.data);
  }
  /** @id CODE-STAT-002 @implements REQ-STAT-002 */
  rows(table: string): number { return Object.hasOwn(this.data, table) ? this.data[table].rows : 1000; }
  /** @id CODE-STAT-013 @implements REQ-STAT-013 */
  column(table: string, name: string): ColumnStats {
    if (Object.hasOwn(this.data, table) && Object.hasOwn(this.data[table].columns, name)) return this.data[table].columns[name];
    return Object.freeze({ distinct: 10, nullFraction: 0 });
  }
}
export function columnStatistics(plan: Plan, cat: Catalog): Record<string, ColumnStats> {
  switch (plan.kind) {
    case 'scan': return Object.fromEntries(plan.columns.map(c => [`${plan.alias}.${c}`, cat.column(plan.table, c)]));
    case 'filter': return columnStatistics(plan.input, cat);
    case 'project': {
      const cols = columnStatistics(plan.input, cat);
      return Object.fromEntries(plan.columns.map(c => [c, cols[c]]));
    }
    case 'join': return { ...columnStatistics(plan.left, cat), ...columnStatistics(plan.right, cat) };
  }
}
/** @id CODE-STAT-003 @implements REQ-STAT-003 REQ-STAT-004 REQ-STAT-005 */
export function selectivity(expr: Expr, cols: Record<string, ColumnStats>): number {
  const clamp = (p: number) => Math.max(0, Math.min(1, p));
  if (expr.kind === 'literal') return expr.value === true ? 1 : 0;
  if (expr.kind === 'column') return 0.5;
  if (expr.kind === 'and') return expr.terms.reduce((p, e) => p * selectivity(e, cols), 1);
  if (expr.kind === 'or') return clamp(1 - expr.terms.reduce((p, e) => p * (1 - selectivity(e, cols)), 1));
  const l = expr.left, r = expr.right;
  if (l.kind === 'literal' && r.kind === 'literal') return evaluate(expr, {}) === true ? 1 : 0;
  if ((l.kind === 'literal' && l.value === null) || (r.kind === 'literal' && r.value === null)) return 0;
  const stats = [l, r].filter(e => e.kind === 'column').map(e => cols[e.name] ?? { distinct: 10, nullFraction: 0 });
  const nonNull = stats.reduce((p, s) => p * (1 - (s.nullFraction ?? 0)), 1);
  const equality = nonNull / Math.max(1, ...stats.map(s => s.distinct));
  if (expr.op === 'eq') return clamp(equality);
  if (expr.op === 'ne') return clamp(nonNull - equality);
  return nonNull / 3;
}
/** @id CODE-STAT-006 @implements REQ-STAT-006 */
export function estimate(plan: Plan, cat: Catalog): number {
  return saturate(measure(plan, cat).value);
}
type Measure = { value: number; log: number };
const scalar = (value: number): Measure => ({ value, log: Math.log(value) });
/** @id CODE-STAT-012 @implements REQ-STAT-012 */
const normal = (value: number): boolean => Number.isFinite(value) && value >= 2 ** -1022;
/** @id CODE-STAT-010 @implements REQ-STAT-010 */
function multiply(a: Measure, b: Measure): Measure {
  if (a.log === -Infinity || b.log === -Infinity) return scalar(0);
  const log = a.log + b.log, product = a.value * b.value;
  return { value: normal(a.value) && normal(b.value) && normal(product) ? product : Math.exp(log), log };
}
/** @id CODE-STAT-011 @implements REQ-STAT-011 */
function probability(expr: Expr, cols: Record<string, ColumnStats>): Measure {
  if (expr.kind === 'and') return expr.terms.reduce((p, e) => multiply(p, probability(e, cols)), scalar(1));
  if (expr.kind === 'or') {
    return expr.terms.reduce<Measure>((a, e) => {
      const b = probability(e, cols);
      if (a.log === 0 || b.log === 0) return scalar(1);
      if (a.log === -Infinity) return b;
      if (b.log === -Infinity) return a;
      const max = Math.max(a.log, b.log);
      const log = Math.min(0, max + Math.log(Math.exp(a.log - max) + Math.exp(b.log - max) - Math.exp(a.log + b.log - max)));
      return { value: Math.exp(log), log };
    }, scalar(0));
  }
  return scalar(selectivity(expr, cols));
}
function measure(plan: Plan, cat: Catalog): Measure {
  switch (plan.kind) {
    case 'scan': return scalar(cat.rows(plan.table));
    case 'project': return measure(plan.input, cat);
    case 'filter': return multiply(measure(plan.input, cat), probability(plan.predicate, columnStatistics(plan.input, cat)));
    case 'join': return multiply(multiply(measure(plan.left, cat), measure(plan.right, cat)), probability(plan.predicate, columnStatistics(plan, cat)));
  }
}
/** @id CODE-STAT-007 @implements REQ-STAT-007 */
export function cost(plan: Plan, cat: Catalog): number {
  const childCost = plan.kind === 'scan' ? 0 : plan.kind === 'join' ? cost(plan.left, cat) + cost(plan.right, cat) : cost(plan.input, cat);
  return saturate(childCost + estimate(plan, cat));
}
