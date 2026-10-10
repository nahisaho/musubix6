import { stratify } from './stratify.js';

/** @id CODE-MAGIC-001 @implements REQ-MAGIC-001 REQ-MAGIC-002 REQ-MAGIC-003 REQ-MAGIC-004 REQ-MAGIC-005 REQ-MAGIC-006 REQ-MAGIC-007 REQ-MAGIC-008 REQ-MAGIC-009 REQ-MAGIC-010 */
export function magicRewrite(input, query) {
  const source = structuredClone(input), target = structuredClone(query);
  const plan = stratify({ ...source, queries: [...source.queries, target] });
  for (const predicate of plan.arity.keys()) {
    if (predicate.startsWith('magic_') || predicate.includes('__')) throw new Error(`reserved predicate namespace: ${predicate}`);
  }
  const idb = new Set(source.rules.map(r => r.head.predicate));
  if (!idb.has(target.predicate)) return { program: source, query: target, stats: { adornments: [], magicRules: 0 } };
  const specialized = (predicate, adornment) => `${predicate}__${adornment}`;
  const magicAtom = (predicate, adornment, terms) => ({
    type: 'atom', predicate: `magic_${specialized(predicate, adornment)}`,
    terms: terms.filter((_, i) => adornment[i] === 'b'), negated: false
  });
  const start = target.terms.map(t => t.kind === 'const' ? 'b' : 'f').join('');
  const output = { facts: [...source.facts, magicAtom(target.predicate, start, target.terms)], rules: [], queries: [] };
  const keep = new Set(source.rules.flatMap(r => r.body.filter(l => l.type === 'atom' && l.negated).map(l => l.predicate)));
  for (;;) {
    const size = keep.size;
    for (const r of source.rules) {
      if (keep.has(r.head.predicate)) for (const l of r.body) if (l.type === 'atom') keep.add(l.predicate);
    }
    if (keep.size === size) break;
  }
  output.rules.push(...source.rules.filter(r => keep.has(r.head.predicate)));
  const queue = [[target.predicate, start]], seen = new Set();
  let magicRules = 0;
  while (queue.length) {
    const [predicate, adornment] = queue.shift(), name = specialized(predicate, adornment);
    if (seen.has(name)) continue;
    seen.add(name);
    if (source.facts.some(fact => fact.predicate === predicate)) {
      const terms = Array.from({ length: plan.arity.get(predicate) }, (_, i) => ({ kind: 'var', name: `_Base${i}` }));
      const original = { type: 'atom', predicate, terms, negated: false };
      output.rules.push({
        id: `base:${name}`, head: { ...original, predicate: name },
        body: [magicAtom(predicate, adornment, terms), original]
      });
    }
    for (const rule of source.rules.filter(r => r.head.predicate === predicate)) {
      const guard = magicAtom(predicate, adornment, rule.head.terms);
      const bound = new Set(rule.head.terms.filter((t, i) => adornment[i] === 'b' && t.kind === 'var').map(t => t.name));
      const body = [guard];
      // Datalog conjunction is order independent; positive joins precede filters for safe demand propagation.
      const ordered = [
        ...rule.body.filter(l => l.type === 'atom' && !l.negated),
        ...rule.body.filter(l => l.type !== 'atom' || l.negated)
      ];
      for (const literal of ordered) {
        let transformed = literal;
        if (literal.type === 'atom' && !literal.negated) {
          if (idb.has(literal.predicate)) {
            const next = literal.terms.map(t => t.kind === 'const' || (t.kind === 'var' && bound.has(t.name)) ? 'b' : 'f').join('');
            const demand = magicAtom(literal.predicate, next, literal.terms);
            output.rules.push({ id: `magic:${rule.id}:${name}:${magicRules++}`, head: demand, body: structuredClone(body) });
            transformed = { ...literal, predicate: specialized(literal.predicate, next) };
            queue.push([literal.predicate, next]);
          }
          for (const t of literal.terms) if (t.kind === 'var') bound.add(t.name);
        }
        body.push(structuredClone(transformed));
      }
      output.rules.push({ id: `${rule.id}:${name}`, head: { ...rule.head, predicate: name }, body });
    }
  }
  const rewritten = { ...target, predicate: specialized(target.predicate, start) };
  output.queries.push(rewritten);
  stratify(output);
  return { program: output, query: rewritten, stats: { adornments: [...seen], magicRules } };
}
