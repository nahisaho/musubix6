import { compare } from './semver.js';
import { parseRange, intersect, satisfies } from './range.js';
import { peerRequirements } from './peer.js';
import { byCode } from './util.js';


/** @id CODE-RSLV-001 @implements REQ-RSLV-001 REQ-RSLV-002 REQ-RSLV-003 REQ-RSLV-004 REQ-RSLV-008 REQ-RSLV-010 REQ-RSLV-009 REQ-RSLV-011 REQ-RSLV-012 REQ-RSLV-013 */
export function resolve(rootDeps, registry, opts = {}) {
  const maxSteps = opts.maxSteps ?? 100000;
  const lowest = opts.prefer === 'lowest';
  const parsed = new Map();
  const rangeOf = (s) => { if (!parsed.has(s)) parsed.set(s, parseRange(s)); return parsed.get(s); };
  const sortedVersions = new Map();
  const versionsOf = (pkg) => {
    if (!sortedVersions.has(pkg)) sortedVersions.set(pkg, Object.keys(registry[pkg] ?? {}).sort(compare));
    return sortedVersions.get(pkg);
  };

  let steps = 0;
  let best = null;
  let limited = false;

  const constraintsOf = (st, pkg) => [...(st.hard.get(pkg) ?? []), ...(st.opt.get(pkg) ?? [])]
    .sort((a, b) => byCode(a.by, b.by) || byCode(a.range, b.range));

  const candidates = (st, pkg) => {
    const cs = constraintsOf(st, pkg);
    const inter = cs.map((c) => rangeOf(c.range)).reduce((a, b) => intersect(a, b));
    const list = versionsOf(pkg).filter((v) => satisfies(v, inter));
    return lowest ? list : list.reverse();
  };

  const fail = (st, reason, pkg, extra = {}) => ({ ok: false, reason, pkg, constraints: constraintsOf(st, pkg).map(({ range, by }) => ({ range, by })), ...extra });

  // returns a failure object, or null when the constraint is consistent with the state
  const addConstraint = (st, pkg, range, by, optional) => {
    const key = optional ? 'opt' : 'hard';
    st[key] = new Map(st[key]);
    st[key].set(pkg, [...(st[key].get(pkg) ?? []), { range, by }]);
    if (!registry[pkg]) return optional ? null : fail(st, 'missing', pkg);
    if (optional && !st.chosen.has(pkg) && !st.hard.has(pkg)) return null;
    const cands = candidates(st, pkg);
    if (!cands.length) return fail(st, 'no-candidate', pkg);
    const cur = st.chosen.get(pkg);
    if (cur !== undefined && !cands.includes(cur)) return fail(st, 'conflict', pkg, { version: cur });
    return null;
  };

  const note = (st, f) => {
    const depth = st.chosen.size;
    if (!best || depth > best.depth) best = { depth, f };
  };

  const search = (st) => {
    const pending = [...st.hard.keys()].filter((p) => !st.chosen.has(p));
    if (!pending.length) return st;
    let pick = null;
    for (const pkg of pending.sort(byCode)) {
      const cands = candidates(st, pkg);
      if (!pick || cands.length < pick.cands.length) pick = { pkg, cands };
    }
    for (const version of pick.cands) {
      if (++steps > maxSteps) { limited = true; return null; }
      const next = { chosen: new Map(st.chosen).set(pick.pkg, version), hard: st.hard, opt: st.opt };
      const meta = registry[pick.pkg][version] ?? {};
      const { required, optional } = peerRequirements(meta);
      const edges = [
        ...Object.entries(meta.deps ?? {}).map(([n, r]) => [n, r, false]),
        ...Object.entries(required).map(([n, r]) => [n, r, false]),
        ...Object.entries(optional).map(([n, r]) => [n, r, true]),
      ].sort((a, b) => byCode(a[0], b[0]));
      let failure = null;
      for (const [n, r, isOpt] of edges) {
        failure = addConstraint(next, n, r, `${pick.pkg}@${version}`, isOpt);
        if (failure) break;
      }
      if (failure) { note(next, failure); continue; }
      const done = search(next);
      if (done) return done;
      if (limited) return null;
    }
    return null;
  };

  const start = { chosen: new Map(), hard: new Map(), opt: new Map() };
  for (const pkg of Object.keys(rootDeps).sort(byCode)) {
    const f = addConstraint(start, pkg, rootDeps[pkg], 'root', false);
    if (f) return { ...f, steps };
  }
  const done = search(start);
  if (done) return { ok: true, tree: new Map([...done.chosen].sort((a, b) => byCode(a[0], b[0]))), steps };
  if (limited) return { ok: false, reason: 'limit', steps };
  return { ...best.f, steps };
}

/** @id CODE-RSLV-002 @implements REQ-RSLV-005 REQ-RSLV-006 REQ-RSLV-007 */
export function explain(failure) {
  if (failure.ok) return '';
  if (failure.reason === 'limit') return `=> gave up after ${failure.steps} steps`;
  const lines = failure.constraints.map((c) => `${failure.pkg}@${c.range} required by ${c.by}`);
  const verdict = {
    missing: `${failure.pkg} is not in the registry`,
    'no-candidate': `no version of ${failure.pkg} satisfies all of the above`,
    conflict: `${failure.pkg}@${failure.version} was selected earlier but violates the above`,
  }[failure.reason];
  return [...lines, `=> ${verdict}`].join('\n');
}
