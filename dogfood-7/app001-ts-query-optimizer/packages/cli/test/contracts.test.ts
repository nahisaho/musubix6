import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { and, column, compare, evaluate, execute, literal, scan, type Expr, type Plan, type Row } from '@query/algebra';
import { Catalog, cost, reorder, simplify } from '@query/optimizer';
import { optimize, printPlan } from '../src/index.ts';

test('differential boolean normalization over SQL truth values and scalars', () => {
  const values = [true, false, null, 0, 1, 's'] as const;
  for (const kind of ['and', 'or'] as const) {
    for (const a of values) for (const b of values) {
      const expr: Expr = { kind, terms: [literal(a), literal(b)] };
      assert.equal(evaluate(simplify(expr), {}), evaluate(expr, {}));
      const nested = compare('eq', expr, literal(1));
      assert.equal(evaluate(simplify(nested), {}), evaluate(nested, {}));
    }
  }
});

test('seeded differential optimizer preserves nulls, duplicate bags and schema', () => {
  let seed = 123456;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % 5; };
  const bag = (rows: Row[]) => rows.map(r => JSON.stringify(Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b))))).sort();
  for (let run = 0; run < 60; run++) {
    const data = Object.fromEntries(['a', 'b', 'c'].map(n => [n, Array.from({ length: 5 }, () => ({ id: random() === 0 ? null : random() }))]));
    const ab: Plan = { kind: 'join', left: scan('a', ['id']), right: scan('b', ['id']), predicate: compare('eq', column('a.id'), column('b.id')) };
    const abc: Plan = { kind: 'join', left: ab, right: scan('c', ['id']), predicate: compare('eq', column('b.id'), column('c.id')) };
    const filtered: Plan = { kind: 'filter', input: abc, predicate: and(compare('gt', column('a.id'), literal(run % 4)), literal(true)) };
    const original: Plan = { kind: 'project', input: run % 2 ? filtered : abc, columns: ['c.id', 'a.id'] };
    const result = optimize(original, { a: { rows: 500, columns: {} }, b: { rows: 3, columns: {} }, c: { rows: 100, columns: {} } });
    assert.deepEqual(bag(execute(result.plan, data)), bag(execute(original, data)));
    assert.ok(result.cost <= result.originalCost);
  }
});

test('connected equijoin DP matches every three-relation bushy tree', () => {
  const rels = ['a', 'b', 'c'].map(n => scan(n, ['id']));
  const cat = new Catalog({ a: { rows: 100, columns: { id: { distinct: 80, nullFraction: 0.1 } } }, b: { rows: 8, columns: { id: { distinct: 5 } } }, c: { rows: 20, columns: { id: { distinct: 10 } } } });
  const edges = [['a', 'b'], ['b', 'c'], ['a', 'c']];
  const predicate = (a: string, b: string) => compare('eq', column(`${a}.id`), column(`${b}.id`));
  const plans: Plan[] = [];
  for (let singleton = 0; singleton < 3; singleton++) {
    const other = rels.filter((_, i) => i !== singleton);
    for (const pair of [other, [...other].reverse()]) {
      const child: Plan = { kind: 'join', left: pair[0], right: pair[1], predicate: predicate(pair[0].alias, pair[1].alias) };
      const joining = edges.filter(e => e.includes(rels[singleton].alias)).map(([a, b]) => predicate(a, b));
      plans.push({ kind: 'join', left: child, right: rels[singleton], predicate: and(...joining) });
      plans.push({ kind: 'join', left: rels[singleton], right: child, predicate: and(...joining) });
    }
  }
  const best = reorder(rels, edges.map(([a, b]) => predicate(a, b)), cat);
  assert.ok(Math.abs(best.cost - Math.min(...plans.map(p => cost(p, cat)))) < 1e-10);
});

test('CLI file mode, invalid flags and nested text output', () => {
  const main = new URL('../src/main.ts', import.meta.url).pathname;
  const file = new URL('../../../examples/query.json', import.meta.url).pathname;
  const run = spawnSync(process.execPath, [main, file], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^Project /);
  assert.match(run.stdout, /\n  Join /);
  const invalid = spawnSync(process.execPath, [main, '--unknown'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /usage/);
  assert.match(printPlan(optimize({ kind: 'filter', input: scan('a', ['id']), predicate: literal(false) }, {})), /Filter false/);
});
