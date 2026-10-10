export interface Node { id: string; deps: readonly string[] }

/** @id CODE-GRAPH-001 @implements REQ-GRAPH-001 REQ-GRAPH-002 REQ-GRAPH-003 REQ-GRAPH-004 REQ-GRAPH-005 REQ-GRAPH-006 REQ-GRAPH-007 REQ-GRAPH-008 */
export class Graph {
  private edges: Map<string, string[]>;

  constructor(nodes: readonly Node[]) {
    const edges = new Map<string, string[]>();
    for (const node of nodes) {
      if (!node.id) throw new Error('empty node ID');
      if (edges.has(node.id)) throw new Error(`duplicate node: ${node.id}`);
      edges.set(node.id, [...new Set(node.deps)].sort());
    }
    this.validate(edges);
    this.edges = edges;
  }

  private validate(edges: Map<string, string[]>): void {
    const done = new Set<string>();
    const path: string[] = [];
    const visit = (id: string): void => {
      if (!edges.has(id)) throw new Error(`unknown dependency: ${id}`);
      const cycle = path.indexOf(id);
      if (cycle >= 0) throw new Error(`cycle: ${[...path.slice(cycle), id].join(' -> ')}`);
      if (done.has(id)) return;
      path.push(id);
      for (const dep of edges.get(id)!) visit(dep);
      path.pop();
      done.add(id);
    };
    for (const id of [...edges.keys()].sort()) visit(id);
  }

  dependencies(id: string): string[] {
    const deps = this.edges.get(id);
    if (!deps) throw new Error(`unknown node: ${id}`);
    return [...deps];
  }

  topology(): string[] {
    const remaining = new Set(this.edges.keys());
    const result: string[] = [];
    while (remaining.size) {
      const ready = [...remaining].filter(id => this.edges.get(id)!.every(dep => !remaining.has(dep))).sort();
      const id = ready[0]!;
      result.push(id);
      remaining.delete(id);
    }
    return result;
  }

  closure(targets: readonly string[]): string[] {
    const selected = new Set<string>();
    const visit = (id: string): void => {
      if (selected.has(id)) return;
      const deps = this.dependencies(id);
      selected.add(id);
      deps.forEach(visit);
    };
    targets.forEach(visit);
    return this.topology().filter(id => selected.has(id));
  }

  replace(id: string, dependencies: readonly string[]): void {
    this.dependencies(id);
    const candidate = new Map(this.edges);
    candidate.set(id, [...new Set(dependencies)].sort());
    this.validate(candidate);
    this.edges = candidate;
  }

  dependents(id: string): string[] {
    this.dependencies(id);
    const selected = new Set([id]);
    for (const node of this.topology()) {
      if (this.edges.get(node)!.some(dep => selected.has(dep))) selected.add(node);
    }
    selected.delete(id);
    return [...selected].sort();
  }

  snapshot(): Node[] {
    return this.topology().map(id => ({id, deps:this.dependencies(id)}));
  }
}
