import { factKey } from './evaluate.js';

/** @id CODE-PROVENANCE-001 @implements REQ-PROVENANCE-001 REQ-PROVENANCE-002 REQ-PROVENANCE-003 REQ-PROVENANCE-004 REQ-PROVENANCE-005 REQ-PROVENANCE-006 REQ-PROVENANCE-007 REQ-PROVENANCE-008 REQ-PROVENANCE-009 */
export function explain(result, predicate, tuple, options = {}) {
  const { maxDepth = 50, maxDerivations = 100, maxNodes = 10000 } = options;
  for (const n of [maxDepth, maxDerivations, maxNodes]) {
    if (!Number.isSafeInteger(n) || n < 0) throw new TypeError('explanation bounds must be nonnegative integers');
  }
  const root = factKey(predicate, tuple);
  if (!result.provenance.has(root)) return null;
  let expanded = 0;
  const visit = (key, depth, path) => {
    const node = result.provenance.get(key);
    const identity = { predicate: node.predicate, tuple: [...node.tuple] };
    if (path.has(key)) return { kind: 'cycle', ...identity };
    if (expanded >= maxNodes) return { kind: 'truncated', ...identity, reason: 'node limit' };
    expanded++;
    if (depth > maxDepth || (depth === maxDepth && node.derivations.length)) return { kind: 'truncated', ...identity };
    const next = new Set(path).add(key);
    const alternatives = [];
    for (const d of node.derivations.slice(0, maxDerivations)) {
      const parents = [];
      for (const parent of d.parents) {
        const exhausted = expanded >= maxNodes;
        parents.push(visit(parent, depth + 1, next));
        if (exhausted) break;
      }
      alternatives.push({
        rule: d.rule, bindings: structuredClone(d.bindings), parents, negatives: structuredClone(d.negatives)
      });
      if (expanded >= maxNodes) {
        alternatives.push({ kind: 'truncated', reason: 'node limit' });
        break;
      }
    }
    if (node.derivations.length > maxDerivations) alternatives.push({ kind: 'truncated', reason: 'derivation limit' });
    return { kind: node.derivations.length ? 'derived' : 'fact', ...identity, base: node.base, alternatives };
  };
  return visit(root, 0, new Set());
}

export function formatExplanation(tree) {
  if (!tree) return 'no proof';
  const lines = [];
  const label = node => `${node.predicate}(${node.tuple.map(v => JSON.stringify(v)).join(',')})`;
  const visit = (node, indent) => {
    const pad = '  '.repeat(indent);
    if (node.kind === 'truncated' && !node.predicate) { lines.push(`${pad}[truncated]`); return; }
    lines.push(`${pad}${label(node)} [${node.kind}${node.base ? ', base' : ''}]`);
    for (const alternative of node.alternatives ?? []) {
      if (alternative.kind === 'truncated') { lines.push(`${pad}  [truncated]`); continue; }
      lines.push(`${pad}  via ${alternative.rule}`);
      for (const parent of alternative.parents) visit(parent, indent + 2);
      for (const negative of alternative.negatives) lines.push(`${pad}    not ${label(negative)} [absent]`);
    }
  };
  visit(tree, 0);
  return lines.join('\n');
}
