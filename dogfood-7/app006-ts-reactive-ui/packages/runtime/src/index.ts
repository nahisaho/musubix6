import { effect } from '../../signals/src/index.ts';
import { createScheduler } from '../../scheduler/src/index.ts';
import type { Scheduler } from '../../scheduler/src/index.ts';
import { matchChildren, validateTree } from '../../vdom/src/index.ts';
import type { Props, VNode } from '../../vdom/src/index.ts';
import { renderToString, attributeEntries } from '../../ssr/src/index.ts';

export interface Host<N> {
  create(node: VNode): N;
  update(node: N, vnode: VNode): void;
  children(node: N, children: N[]): void;
  setRoot(node: N | null): void;
  remove(node: N): void;
}
interface Instance<N> { vnode: VNode; node: N; children: Instance<N>[] }

/** @id CODE-RUNTIME-001 @implements REQ-RUNTIME-001 REQ-RUNTIME-002 REQ-RUNTIME-003 REQ-RUNTIME-004 REQ-RUNTIME-005 REQ-RUNTIME-006 REQ-RUNTIME-008 REQ-RUNTIME-009 REQ-RUNTIME-010 */
export function mount<N>(view: () => VNode, host: Host<N>, scheduler: Scheduler = createScheduler({ auto: true })): { dispose(): void } {
  let committed: Instance<N> | undefined, next: VNode | undefined;
  let failure: unknown, failed = false, disposed = false, initial = true;
  let cancel: (() => void) | undefined;
  const key = Symbol('mount');
  function destroy(instance: Instance<N>): void {
    instance.children.forEach(destroy); host.remove(instance.node);
  }
  function reconcile(old: Instance<N> | undefined, vnode: VNode): Instance<N> {
    if (!old || old.vnode.type !== vnode.type || old.vnode.key !== vnode.key) {
      const node = host.create(vnode);
      const children = vnode.children.map(child => reconcile(undefined, child));
      host.children(node, children.map(child => child.node));
      if (old) destroy(old);
      return { vnode, node, children };
    }
    host.update(old.node, vnode);
    const matches = matchChildren(old.vnode.children, vnode.children);
    const used = new Set<number>();
    const children = vnode.children.map((child, i) => {
      const from = matches[i];
      if (from !== undefined) used.add(from);
      return reconcile(from === undefined ? undefined : old.children[from], child);
    });
    old.children.forEach((child, i) => { if (!used.has(i)) destroy(child); });
    host.children(old.node, children.map(child => child.node));
    return { vnode, node: old.node, children };
  }
  function commit(): void {
    cancel = undefined;
    if (disposed) return;
    if (failed) throw failure;
    validateTree(next!);
    renderToString(next!);
    committed = reconcile(committed, next!);
    host.setRoot(committed.node);
  }
  const stop = effect(() => {
    try { next = view(); failed = false; }
    catch (error) { failure = error; failed = true; }
    if (initial) { initial = false; commit(); }
    else cancel = scheduler.schedule(commit, 'normal', key);
  });
  return {
    dispose() {
      if (disposed) return;
      disposed = true; stop(); cancel?.();
      if (committed) destroy(committed);
      host.setRoot(null); committed = undefined;
    }
  };
}

export interface MemoryNode {
  type: string;
  value?: string;
  props: Props;
  children: MemoryNode[];
  listeners: Map<string, (...args: unknown[]) => unknown>;
}
/** @id CODE-RUNTIME-007 @implements REQ-RUNTIME-007 */
export function memoryHost(): Host<MemoryNode> & { readonly root: MemoryNode | null; html(): string } {
  const host = {
    root: null as MemoryNode | null,
    create(vnode: VNode): MemoryNode {
      const node: MemoryNode = { type: vnode.type, props: {}, children: [], listeners: new Map() };
      host.update(node, vnode); return node;
    },
    update(node: MemoryNode, vnode: VNode): void {
      node.value = vnode.value; node.props = vnode.props; node.listeners.clear();
      for (const [name, value] of Object.entries(vnode.props)) {
        if (/^on/i.test(name) && typeof value === 'function') node.listeners.set(name.slice(2).toLowerCase(), value as (...args: unknown[]) => unknown);
      }
    },
    children(node: MemoryNode, children: MemoryNode[]): void { node.children = children; },
    setRoot(node: MemoryNode | null): void { host.root = node; },
    remove(node: MemoryNode): void { node.listeners.clear(); },
    html(): string {
      function vnode(node: MemoryNode): VNode {
        return { type: node.type, value: node.value, props: node.props, children: node.children.map(vnode) };
      }
      return host.root ? renderToString(vnode(host.root)) : '';
    }
  };
  return host;
}

/** @id CODE-RUNTIME-012 @implements REQ-RUNTIME-012 */
export function domHost(container: Element): Host<Node> {
  const document = container.ownerDocument;
  const previous = new WeakMap<Node, Props>();
  function update(node: Node, vnode: VNode): void {
    if (vnode.type === '#text') { node.nodeValue = vnode.value ?? ''; return; }
    const element = node as Element;
    const attributes = attributeEntries(vnode.props);
    const before = previous.get(node) ?? {};
    for (const [name, value] of Object.entries(before)) {
      if (/^on/i.test(name) && typeof value === 'function') element.removeEventListener(name.slice(2).toLowerCase(), value as EventListener);
      else if (name !== 'key') element.removeAttribute(name);
    }
    for (const [name, value] of attributes) element.setAttribute(name, value === true ? '' : value);
    for (const [name, value] of Object.entries(vnode.props)) {
      if (/^on/i.test(name) && typeof value === 'function') element.addEventListener(name.slice(2).toLowerCase(), value as EventListener);
    }
    previous.set(node, vnode.props);
  }
  return {
    create(vnode) {
      const node = vnode.type === '#text' ? document.createTextNode(vnode.value ?? '') : document.createElement(vnode.type);
      update(node, vnode); return node;
    },
    update,
    children(node, children) {
      children.forEach((child, i) => { if (node.childNodes[i] !== child) node.insertBefore(child, node.childNodes[i] ?? null); });
      while (node.childNodes.length > children.length) node.removeChild(node.lastChild!);
    },
    setRoot(node) { if (node) container.replaceChildren(node); else container.replaceChildren(); },
    remove(node) {
      for (const [name, value] of Object.entries(previous.get(node) ?? {})) {
        if (/^on/i.test(name) && typeof value === 'function') node.removeEventListener(name.slice(2).toLowerCase(), value as EventListener);
      }
      previous.delete(node);
      node.parentNode?.removeChild(node);
    }
  };
}
