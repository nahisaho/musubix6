import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, evaluate, tuples, query, magicRewrite, explain } from '../src/index.js';

const canonical = rows => rows.map(JSON.stringify).sort();

test('seeded graph differential: naive, semi-naive, all query adornments and negation', () => {
  let seed = 714;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  for (let sample = 0; sample < 24; sample++) {
    const edges = [];
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) if ((next() >>> 24) % 4 === 0) edges.push(`edge(${x},${y}).`);
    const source = edges.join('') + 'node(0). node(1). node(2). node(3). node(4). path(4,4). path(X,Y) :- edge(X,Y). path(X,Z) :- path(X,Y), path(Y,Z). missing(X,Y) :- node(X), node(Y), not path(X,Y).';
    const p = parse(source), semi = evaluate(p), naive = evaluate(p, { strategy: 'naive' });
    for (const predicate of ['path', 'missing']) {
      assert.deepEqual(canonical(tuples(semi, predicate)), canonical(tuples(naive, predicate)));
      for (const terms of ['X,Y', '0,Y', 'X,3', '0,3', 'X,X', '_,4']) {
        const q = parse(`?- ${predicate}(${terms}).`).queries[0], m = magicRewrite(p, q);
        assert.deepEqual(canonical(query(evaluate(m.program), m.query)), canonical(query(semi, q)), `${sample}: ${predicate}(${terms})`);
      }
    }
  }
});

test('evaluation plan and explanations are isolated from source AST mutation', () => {
  const p = parse('p(a). q(X) :- p(X).'), before = JSON.stringify(p), r = evaluate(p);
  r.plan.groups[0].rules[0].head.predicate = 'mutated';
  assert.equal(JSON.stringify(p), before);
  assert.equal(explain(r, 'q', ['a']).predicate, 'q');
});
