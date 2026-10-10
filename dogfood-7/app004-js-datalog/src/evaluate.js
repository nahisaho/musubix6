import { parse } from './parser.js';
import { stratify } from './stratify.js';

export const tupleKey = tuple => JSON.stringify(tuple);
export const factKey = (predicate, tuple) => `${predicate}:${tupleKey(tuple)}`;
const value = (term, env) => term.kind === 'const' ? term.value : env.get(term.name);

function unify(terms, tuple, env) {
  if (terms.length !== tuple.length) return null;
  const next = new Map(env);
  for (let i = 0; i < terms.length; i++) {
    const t = terms[i], v = tuple[i];
    if (t.kind === 'wildcard') continue;
    if (t.kind === 'const') { if (t.value !== v) return null; }
    else if (next.has(t.name)) { if (next.get(t.name) !== v) return null; }
    else next.set(t.name, v);
  }
  return next;
}

function compare(op, a, b) {
  if (op === '=') return a === b;
  if (op === '!=') return a !== b;
  if (typeof a !== typeof b) return false;
  switch (op) {
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
    default: throw new Error(`unknown comparison ${op}`);
  }
}

/** @id CODE-EVALUATE-001 @implements REQ-EVALUATE-001 REQ-EVALUATE-002 REQ-EVALUATE-003 REQ-EVALUATE-004 REQ-EVALUATE-005 REQ-EVALUATE-006 REQ-EVALUATE-007 REQ-EVALUATE-008 REQ-EVALUATE-009 REQ-EVALUATE-010 */
export function evaluate(input, options = {}) {
  const { strategy = 'semi-naive', maxIterations = 10000, maxFacts = 100000, maxWork = 1000000, maxProofs = 250000 } = options;
  if (!['semi-naive', 'naive'].includes(strategy)) throw new TypeError('unknown strategy');
  for (const n of [maxIterations, maxFacts, maxWork, maxProofs]) {
    if (!Number.isSafeInteger(n) || n <= 0) throw new TypeError('limits must be positive integers');
  }
  const program = typeof input === 'string' ? parse(input) : structuredClone(input);
  const plan = stratify(program);
  const relations = new Map([...plan.arity.keys()].map(p => [p, new Map()]));
  const provenance = new Map();
  const stats = { iterations: 0, candidates: 0, joins: 0, deltaRounds: 0, facts: 0, work: 0, proofs: 0 };
  const work = () => { if (++stats.work > maxWork) throw new Error('work limit exceeded'); };
  const add = (predicate, tuple, proof = null, base = false) => {
    const key = factKey(predicate, tuple), relation = relations.get(predicate);
    const fresh = !relation.has(tupleKey(tuple));
    if (fresh) {
      if (stats.facts >= maxFacts) throw new Error('fact limit exceeded');
      stats.facts++;
      relation.set(tupleKey(tuple), [...tuple]);
      provenance.set(key, { predicate, tuple: [...tuple], base, derivations: [], signatures: new Set() });
    }
    const node = provenance.get(key);
    if (base) node.base = true;
    if (proof) {
      const signature = JSON.stringify(proof);
      if (!node.signatures.has(signature)) {
        if (++stats.proofs > maxProofs) throw new Error('proof limit exceeded');
        node.signatures.add(signature);
        node.derivations.push(proof);
      }
    }
    return fresh;
  };
  for (const atom of program.facts) add(atom.predicate, atom.terms.map(t => t.value), null, true);
  const schedules = new Map(program.rules.map(rule => {
    const positives = rule.body.filter(l => l.type === 'atom' && !l.negated);
    const recursive = positives.map((l, i) =>
      plan.strata.get(l.predicate) === plan.strata.get(rule.head.predicate) ? i : -1).filter(i => i >= 0);
    return [rule, { positives, recursive, filters: rule.body.filter(l => l.type !== 'atom' || l.negated) }];
  }));
  const runRule = (rule, selected, delta, pending) => {
    const { positives, filters } = schedules.get(rule);
    let states = [{ env: new Map(), parents: [] }];
    for (let i = 0; i < positives.length; i++) {
      const atom = positives[i], next = [];
      const rows = i === selected ? (delta.get(atom.predicate)?.values() ?? []) : relations.get(atom.predicate).values();
      const available = [...rows];
      for (const state of states) {
        for (const tuple of available) {
          work();
          stats.joins++;
          const env = unify(atom.terms, tuple, state.env);
          if (env) next.push({ env, parents: [...state.parents, factKey(atom.predicate, tuple)] });
        }
      }
      states = next;
    }
    for (const state of states) {
      const negatives = [];
      let valid = true;
      for (const l of filters) {
        if (l.type === 'comparison') {
          if (!compare(l.op, value(l.left, state.env), value(l.right, state.env))) { valid = false; break; }
        } else if (l.negated) {
          const tuple = l.terms.map(t => value(t, state.env));
          if (relations.get(l.predicate).has(tupleKey(tuple))) { valid = false; break; }
          negatives.push({ predicate: l.predicate, tuple, absent: true });
        }
      }
      if (!valid) continue;
      work();
      stats.candidates++;
      const tuple = rule.head.terms.map(t => value(t, state.env));
      pending.push({
        predicate: rule.head.predicate, tuple,
        proof: { rule: rule.id, parents: state.parents, negatives, bindings: Object.fromEntries(state.env) }
      });
    }
  };
  for (const group of plan.groups) {
    let delta = new Map([...relations].filter(([p]) => plan.strata.get(p) === group.level)
      .map(([p, rows]) => [p, new Map(rows)]));
    let first = true;
    for (;;) {
      if (++stats.iterations > maxIterations) throw new Error('iteration limit exceeded');
      const pending = [];
      for (const rule of group.rules) {
        const { positives, recursive } = schedules.get(rule);
        if (strategy === 'naive') runRule(rule, -1, delta, pending);
        else if (recursive.length === 0) { if (first) runRule(rule, -1, delta, pending); }
        else for (const i of recursive) {
          if (delta.get(positives[i].predicate)?.size) runRule(rule, i, delta, pending);
        }
      }
      const next = new Map();
      for (const { predicate, tuple, proof } of pending) {
        if (add(predicate, tuple, proof)) {
          if (!next.has(predicate)) next.set(predicate, new Map());
          next.get(predicate).set(tupleKey(tuple), tuple);
        }
      }
      if (next.size === 0) break;
      stats.deltaRounds++;
      delta = next;
      first = false;
    }
  }
  return { relations, provenance, stats, plan };
}

export function tuples(result, predicate) {
  return [...(result.relations.get(predicate)?.values() ?? [])].map(t => [...t]);
}

export function query(result, pattern) {
  let atom = pattern;
  if (typeof pattern === 'string') {
    const parsed = parse(pattern);
    if (parsed.queries.length !== 1 || parsed.facts.length || parsed.rules.length) {
      throw new TypeError('query string must contain exactly one query and no other statements');
    }
    atom = parsed.queries[0];
  }
  if (!atom || atom.type !== 'atom') throw new TypeError('query must be an atom or ?- query string');
  if (result.plan.arity.has(atom.predicate) && result.plan.arity.get(atom.predicate) !== atom.terms.length) {
    throw new Error(`query arity mismatch for ${atom.predicate}`);
  }
  return tuples(result, atom.predicate).filter(tuple => unify(atom.terms, tuple, new Map()) !== null);
}
