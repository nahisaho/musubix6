/** @id CODE-STRATIFY-001 @implements REQ-STRATIFY-001 REQ-STRATIFY-002 REQ-STRATIFY-003 REQ-STRATIFY-004 REQ-STRATIFY-005 REQ-STRATIFY-006 REQ-STRATIFY-007 REQ-STRATIFY-008 */
export function stratify(program) {
  const arity = new Map(), edges = [];
  const register = atom => {
    if (arity.has(atom.predicate) && arity.get(atom.predicate) !== atom.terms.length) {
      throw new Error(`arity mismatch for ${atom.predicate}`);
    }
    arity.set(atom.predicate, atom.terms.length);
  };
  for (const atom of [...program.facts, ...program.queries]) register(atom);
  for (const rule of program.rules) {
    register(rule.head);
    const bound = new Set(rule.body.filter(l => l.type === 'atom' && !l.negated)
      .flatMap(l => l.terms.filter(t => t.kind === 'var').map(t => t.name)));
    const check = (terms, context) => {
      for (const t of terms) {
        if (t.kind === 'wildcard') throw new Error(`anonymous term forbidden in ${context} of ${rule.id}`);
        if (t.kind === 'var' && !bound.has(t.name)) throw new Error(`unsafe variable ${t.name} in ${rule.id}`);
      }
    };
    check(rule.head.terms, 'head');
    for (const l of rule.body) {
      if (l.type === 'atom') {
        register(l);
        edges.push({ head: rule.head.predicate, dependency: l.predicate, weight: Number(l.negated) });
        if (l.negated) check(l.terms, 'negation');
      } else check([l.left, l.right], 'comparison');
    }
  }
  const strata = new Map([...arity.keys()].map(p => [p, 0]));
  // Longest signed dependency paths stabilize in at most |predicates| passes unless a negative cycle exists.
  for (let pass = 0; pass < strata.size; pass++) {
    let changed = false;
    for (const { head, dependency, weight } of edges) {
      const needed = strata.get(dependency) + weight;
      if (strata.get(head) < needed) { strata.set(head, needed); changed = true; }
    }
    if (!changed) break;
    if (pass === strata.size - 1) throw new Error('unstratifiable negative dependency cycle');
  }
  const groups = [...new Set(program.rules.map(r => strata.get(r.head.predicate)))].sort((a, b) => a - b)
    .map(level => ({ level, rules: program.rules.filter(r => strata.get(r.head.predicate) === level) }));
  return { strata, groups, arity };
}
