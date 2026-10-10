export type Value = null | boolean | number | string;
export type Expr =
  | { kind: 'column'; name: string }
  | { kind: 'literal'; value: Value }
  | { kind: 'compare'; op: 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge'; left: Expr; right: Expr }
  | { kind: 'and'; terms: Expr[] }
  | { kind: 'or'; terms: Expr[] };
export type Scan = { kind: 'scan'; table: string; alias: string; columns: string[] };
export type Plan = Scan | { kind: 'filter'; input: Plan; predicate: Expr } | { kind: 'project'; input: Plan; columns: string[] } | { kind: 'join'; left: Plan; right: Plan; predicate: Expr };
export type Row = Record<string, Value>;
export type Tables = Record<string, Row[]>;
/** @id CODE-ALG-001 @implements REQ-ALG-001 */
export function scan(table: string, columns: string[], alias = table): Scan {
  return { kind: 'scan', table, alias, columns: [...columns] };
}
export function column(name: string): Expr { return { kind: 'column', name }; }
export function literal(value: Value): Expr { return { kind: 'literal', value }; }
export function compare(op: Extract<Expr, { kind: 'compare' }>['op'], left: Expr, right: Expr): Expr {
  return { kind: 'compare', op, left, right };
}
export function and(...terms: Expr[]): Expr { return { kind: 'and', terms }; }

/** @id CODE-ALG-002 @implements REQ-ALG-002 */
export function references(expr: Expr): string[] {
  if (expr.kind === 'column') return [expr.name];
  if (expr.kind === 'literal') return [];
  const children = expr.kind === 'compare' ? [expr.left, expr.right] : expr.terms;
  return [...new Set(children.flatMap(references))].sort();
}
/** @id CODE-ALG-003 @implements REQ-ALG-003 REQ-ALG-005 */
export function validate(plan: Plan): void {
  const aliases = new Set<string>();
  const active = new Set<object>();
  let visited = 0;
  const enter = (node: unknown, depth: number): Record<string, any> => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) throw new TypeError('invalid node');
    if (depth > 128 || ++visited > 10000 || active.has(node)) throw new Error('plan depth/cycle budget exceeded');
    active.add(node);
    return node as Record<string, any>;
  };
  const name = (s: unknown) => typeof s === 'string' && /^[A-Za-z_]\w*$/.test(s);
  const expr = (e: unknown, cols: string[], depth: number): void => {
    const n = enter(e, depth);
    switch (n.kind) {
      case 'column':
        if (typeof n.name !== 'string' || !cols.includes(n.name)) throw new Error(`unknown column ${n.name}`);
        break;
      case 'literal':
        if (!(n.value === null || typeof n.value === 'boolean' || typeof n.value === 'string' || (typeof n.value === 'number' && Number.isFinite(n.value)))) throw new Error('invalid literal');
        break;
      case 'compare':
        if (!['eq', 'ne', 'lt', 'le', 'gt', 'ge'].includes(n.op)) throw new Error('invalid comparison op');
        expr(n.left, cols, depth + 1); expr(n.right, cols, depth + 1);
        break;
      case 'and': case 'or':
        if (!Array.isArray(n.terms)) throw new Error('invalid terms');
        n.terms.forEach((e: unknown) => expr(e, cols, depth + 1));
        break;
      default: throw new Error(`invalid expression kind ${n.kind}`);
    }
    active.delete(n);
  };
  const walk = (p: unknown, depth: number): string[] => {
    const n = enter(p, depth);
    let cols: string[];
    switch (n.kind) {
      case 'scan':
        if (!name(n.table) || !name(n.alias) || !Array.isArray(n.columns) || !n.columns.every(name) || new Set(n.columns).size !== n.columns.length) throw new Error('invalid scan schema');
        if (aliases.has(n.alias)) throw new Error(`duplicate alias ${n.alias}`);
        aliases.add(n.alias);
        cols = n.columns.map((c: string) => `${n.alias}.${c}`);
        break;
      case 'filter':
        cols = walk(n.input, depth + 1); expr(n.predicate, cols, depth + 1);
        break;
      case 'project': {
        const input = walk(n.input, depth + 1);
        if (!Array.isArray(n.columns) || new Set(n.columns).size !== n.columns.length) throw new Error('invalid projection');
        for (const c of n.columns) if (!input.includes(c)) throw new Error(`unknown column ${c}`);
        cols = [...n.columns];
        break;
      }
      case 'join':
        cols = [...walk(n.left, depth + 1), ...walk(n.right, depth + 1)];
        expr(n.predicate, cols, depth + 1);
        break;
      default: throw new Error(`invalid plan kind ${n.kind}`);
    }
    active.delete(n);
    return cols;
  };
  walk(plan, 0);
}
/** @id CODE-ALG-004 @implements REQ-ALG-004 */
export function outputColumns(plan: Plan): string[] {
  switch (plan.kind) {
    case 'scan': return plan.columns.map(c => `${plan.alias}.${c}`);
    case 'project': return [...plan.columns];
    case 'filter': return outputColumns(plan.input);
    case 'join': return [...outputColumns(plan.left), ...outputColumns(plan.right)];
  }
}
/** @id CODE-ALG-006 @implements REQ-ALG-006 */
export function fingerprint(value: unknown): string {
  const canonical = (x: any): any => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;
  return JSON.stringify(canonical(value));
}

export const TRUTH_TABLES: Record<'and' | 'or', Record<string, boolean | null>> = {
  and: { TT: true, TF: false, TU: null, FT: false, FF: false, FU: false, UT: null, UF: false, UU: null },
  or: { TT: true, TF: true, TU: true, FT: true, FF: false, FU: null, UT: true, UF: null, UU: null }
};
const truthKey = (v: Value): string => v === true ? 'T' : v === false ? 'F' : 'U';
export function evaluate(expr: Expr, row: Row): Value {
  switch (expr.kind) {
    case 'literal': return expr.value;
    case 'column': return row[expr.name] ?? null;
    case 'and': case 'or':
      return expr.terms.map(e => evaluate(e, row)).reduce<Value>((a, b) => TRUTH_TABLES[expr.kind][truthKey(a) + truthKey(b)], expr.kind === 'and');
    case 'compare': {
      const a = evaluate(expr.left, row), b = evaluate(expr.right, row);
      if (a === null || b === null) return null;
      if (expr.op === 'eq') return a === b;
      if (expr.op === 'ne') return a !== b;
      if (typeof a !== typeof b || (typeof a !== 'number' && typeof a !== 'string')) return null;
      if (expr.op === 'lt') return a < b;
      if (expr.op === 'le') return a <= b;
      if (expr.op === 'gt') return a > b;
      return a >= b;
    }
  }
}
/** @id CODE-ALG-007 @implements REQ-ALG-007 REQ-ALG-008 */
export function execute(plan: Plan, tables: Tables): Row[] {
  validate(plan);
  const run = (p: Plan): Row[] => {
    switch (p.kind) {
      case 'scan':
        if (!hasOwn(tables, p.table)) throw new Error(`missing table ${p.table}`);
        return tables[p.table].map(row => Object.fromEntries(p.columns.map(c => [`${p.alias}.${c}`, hasOwn(row, c) ? row[c] ?? null : null])));
      case 'filter': return run(p.input).filter(row => evaluate(p.predicate, row) === true);
      case 'project': return run(p.input).map(row => Object.fromEntries(p.columns.map(c => [c, row[c]])));
      case 'join': {
        const right = run(p.right);
        return run(p.left).flatMap(a => right.map(b => ({ ...a, ...b })).filter(row => evaluate(p.predicate, row) === true));
      }
    }
  };
  return run(plan);
}
/** @id CODE-ALG-010 @implements REQ-ALG-010 */
const hasOwn = (object: object, key: string): boolean => Object.hasOwn(object, key);
