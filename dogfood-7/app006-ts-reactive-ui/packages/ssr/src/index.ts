import { untrack } from '../../signals/src/index.ts';
import type { VNode } from '../../vdom/src/index.ts';
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const urlAttributes = new Set(['href', 'src', 'action', 'formaction', 'poster', 'xlink:href']);

/** @id CODE-SSR-002 @implements REQ-SSR-002 REQ-SSR-003 */
function escape(value: string, attribute = false): string {
  const escaped = value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return attribute ? escaped.replaceAll('"', '&quot;').replaceAll("'", '&#39;') : escaped;
}

/** @id CODE-SSR-007 @implements REQ-SSR-007 */
export function styleString(value: Record<string, unknown>): string {
  return Object.keys(value).sort().filter(key => value[key] != null).map(key => {
    const name = key.startsWith('--') ? key : key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
    if (!/^--[\w-]+$|^[a-z][a-z-]*$/.test(name)) throw new TypeError('unsafe style name');
    return `${name}:${String(value[key])}`;
  }).join(';');
}

/** @id CODE-SSR-004 @implements REQ-SSR-004 REQ-SSR-005 REQ-SSR-008 REQ-SSR-009 REQ-SSR-011 */
export function attributeEntries(props: Readonly<Record<string, unknown>>): [string, string | true][] {
  const attributes: [string, string | true][] = [];
  for (const name of Object.keys(props).sort()) {
    if (!/^[A-Za-z_:][A-Za-z0-9_.:-]*$/.test(name)) throw new TypeError('unsafe attribute name');
    const value = props[name];
    if (name === 'key' || /^on/i.test(name) || value == null || value === false || typeof value === 'function') continue;
    const rendered = value === true ? '' : name === 'style' && typeof value === 'object'
      ? styleString(value as Record<string, unknown>) : String(value);
    if (urlAttributes.has(name.toLowerCase())) {
      const normalized = rendered.replace(/[\u0000-\u0020\u007f]/g, '').toLowerCase();
      if (/^(javascript|vbscript):/.test(normalized)) throw new TypeError('unsafe URL');
    }
    attributes.push([name, value === true ? true : rendered]);
  }
  return attributes;
}
export function serializeAttributes(props: Readonly<Record<string, unknown>>): string {
  const attributes = attributeEntries(props).map(([name, value]) => value === true ? name : `${name}="${escape(value, true)}"`);
  return attributes.length ? ` ${attributes.join(' ')}` : '';
}

/** @id CODE-SSR-001 @implements REQ-SSR-001 REQ-SSR-006 REQ-SSR-010 REQ-SSR-012 */
export function renderToString(input: VNode | (() => VNode)): string {
  return untrack(() => {
    function render(node: VNode): string {
      if (node.type === '#text') return escape(node.value ?? '');
      if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(node.type)) throw new TypeError('unsafe tag name');
      const tag = node.type.toLowerCase();
      if (tag === 'script' || tag === 'style') throw new TypeError('unsupported raw-text element');
      const attributes = serializeAttributes(node.props);
      if (voidTags.has(tag)) {
        if (node.children.length) throw new TypeError('void element cannot have children');
        return `<${tag}${attributes}>`;
      }
      return `<${tag}${attributes}>${node.children.map(render).join('')}</${tag}>`;
    }
    return render(typeof input === 'function' ? input() : input);
  });
}
