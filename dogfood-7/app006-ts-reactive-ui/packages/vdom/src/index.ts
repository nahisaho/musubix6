export type Key = string | number;
export type Props = Readonly<Record<string, unknown>>;
export interface VNode {
  readonly type: string;
  readonly key?: Key;
  readonly value?: string;
  readonly props: Props;
  readonly children: readonly VNode[];
}
export type Child = VNode | string | number | null | undefined | boolean | readonly Child[];
export interface Patch {
  op: 'text' | 'replace' | 'props' | 'move' | 'insert' | 'remove';
  path: number[];
  value?: string;
  node?: VNode;
  changes?: Record<string, unknown>;
  from?: number;
  to?: number;
}

/** @id CODE-VDOM-001 @implements REQ-VDOM-001 REQ-VDOM-002 REQ-VDOM-003 REQ-VDOM-011 */
export function text(value: string | number): VNode {
  return Object.freeze({ type: '#text', value: String(value), props: Object.freeze({}), children: Object.freeze([]) });
}
export function h(type: string, props: Record<string, unknown> = {}, ...input: Child[]): VNode {
  const children: VNode[] = [];
  function append(child: Child): void {
    if (Array.isArray(child)) { for (const item of child) append(item); }
    else if (child == null || typeof child === 'boolean') return;
    else if (typeof child === 'string' || typeof child === 'number') children.push(text(child));
    else children.push(child as VNode);
  }
  input.forEach(append);
  const copy = { ...props };
  if (copy.style && typeof copy.style === 'object') copy.style = Object.freeze({ ...copy.style });
  const key = props.key;
  if (key !== undefined && typeof key !== 'string' && typeof key !== 'number') throw new TypeError('invalid key');
  if (typeof key === 'number' && Number.isNaN(key)) throw new TypeError('NaN is an invalid key');
  return Object.freeze({ type, key, props: Object.freeze(copy), children: Object.freeze(children) });
}

/** @id CODE-VDOM-009 @implements REQ-VDOM-009 */
export function validateTree(node: VNode): void {
  const keys = new Set<Key>();
  for (const child of node.children) {
    if (child.key !== undefined) {
      if (keys.has(child.key)) throw new Error(`duplicate sibling key: ${child.key}`);
      keys.add(child.key);
    }
    validateTree(child);
  }
}

/** @id CODE-VDOM-007 @implements REQ-VDOM-007 REQ-VDOM-008 REQ-VDOM-010 */
export function matchChildren(oldChildren: readonly VNode[], nextChildren: readonly VNode[]): (number | undefined)[] {
  const keyed = new Map<Key, number>();
  oldChildren.forEach((node, i) => { if (node.key !== undefined) keyed.set(node.key, i); });
  return nextChildren.map((node, i) => node.key !== undefined
    ? keyed.get(node.key)
    : oldChildren[i]?.key === undefined && oldChildren[i] ? i : undefined);
}

/** @id CODE-VDOM-004 @implements REQ-VDOM-004 REQ-VDOM-005 REQ-VDOM-006 */
export function diff(oldNode: VNode, nextNode: VNode): Patch[] {
  validateTree(oldNode); validateTree(nextNode);
  const patches: Patch[] = [];
  function walk(old: VNode, next: VNode, path: number[]): void {
    if (old.type !== next.type || old.key !== next.key) {
      patches.push({ op: 'replace', path, node: next }); return;
    }
    if (next.type === '#text') {
      if (old.value !== next.value) patches.push({ op: 'text', path, value: next.value });
      return;
    }
    const changes: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(old.props), ...Object.keys(next.props)])) {
      if (key !== 'key' && !Object.is(old.props[key], next.props[key])) changes[key] = next.props[key];
    }
    if (Object.keys(changes).length) patches.push({ op: 'props', path, changes });
    const matches = matchChildren(old.children, next.children);
    const used = new Set<number>();
    next.children.forEach((child, to) => {
      const from = matches[to];
      if (from === undefined) patches.push({ op: 'insert', path, to, node: child });
      else {
        used.add(from);
        if (from !== to) patches.push({ op: 'move', path, from, to });
        walk(old.children[from], child, [...path, from]);
      }
    });
    old.children.forEach((_, from) => { if (!used.has(from)) patches.push({ op: 'remove', path, from }); });
  }
  walk(oldNode, nextNode, []);
  return patches;
}
