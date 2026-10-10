import { satisfies } from './range.js';
import { byCode } from './util.js';


/** @id CODE-PEER-001 @implements REQ-PEER-001 REQ-PEER-002 */
export function peerRequirements(meta) {
  const required = {};
  const optional = {};
  const peers = meta?.peerDeps ?? {};
  for (const name of Object.keys(peers).sort(byCode)) {
    (meta.peerMeta?.[name]?.optional === true ? optional : required)[name] = peers[name];
  }
  return { required, optional };
}

/** @id CODE-PEER-002 @implements REQ-PEER-003 REQ-PEER-004 REQ-PEER-005 REQ-PEER-006 REQ-PEER-007 REQ-PEER-008 */
export function checkPeers(tree, registry) {
  const out = [];
  for (const pkg of [...tree.keys()].sort(byCode)) {
    const version = tree.get(pkg);
    const { required, optional } = peerRequirements(registry[pkg]?.[version]);
    const all = [...Object.entries(required).map(([n, r]) => [n, r, false]), ...Object.entries(optional).map(([n, r]) => [n, r, true])]
      .sort((a, b) => byCode(a[0], b[0]));
    for (const [peer, range, isOptional] of all) {
      const actual = tree.get(peer);
      if (actual === undefined) {
        if (!isOptional) out.push({ pkg, version, peer, range, kind: 'missing' });
      } else if (!satisfies(actual, range)) {
        out.push({ pkg, version, peer, range, kind: 'mismatch', actual });
      }
    }
  }
  return out;
}

/** @id CODE-PEER-003 @implements REQ-PEER-009 */
export function formatViolation(v) {
  const head = `${v.pkg}@${v.version} requires peer ${v.peer}@${v.range}`;
  return v.kind === 'missing' ? `${head} but it is missing` : `${head} but found ${v.actual}`;
}
