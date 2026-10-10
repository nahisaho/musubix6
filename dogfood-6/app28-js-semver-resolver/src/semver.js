export class SemverError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SemverError';
  }
}

const NUM = '(0|[1-9]\\d*)';
const ID = '(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)';
const BID = '[0-9A-Za-z-]+';
const RE = new RegExp(`^${NUM}\\.${NUM}\\.${NUM}(?:-(${ID}(?:\\.${ID})*))?(?:\\+(${BID}(?:\\.${BID})*))?$`);

function core(s, what) {
  const n = Number(s);
  if (!Number.isSafeInteger(n)) throw new SemverError(`${what} too large: ${s}`);
  return n;
}

/** @id CODE-SEMV-001 @implements REQ-SEMV-001 REQ-SEMV-002 */
export function parse(s) {
  if (typeof s !== 'string') throw new SemverError(`version must be a string, got ${typeof s}`);
  const m = RE.exec(s);
  if (!m) throw new SemverError(`invalid version: ${JSON.stringify(s)}`);
  const prerelease = m[4] === undefined ? [] : m[4].split('.').map((id) => {
    if (!/^\d+$/.test(id)) return id;
    const n = BigInt(id);
    return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : n;
  });
  return {
    major: core(m[1], 'major'),
    minor: core(m[2], 'minor'),
    patch: core(m[3], 'patch'),
    prerelease,
    build: m[5] === undefined ? [] : m[5].split('.'),
  };
}

const asV = (v) => (typeof v === 'string' ? parse(v) : v);

function cmpId(a, b) {
  const an = typeof a !== 'string';
  const bn = typeof b !== 'string';
  if (an && bn) return a < b ? -1 : a > b ? 1 : 0;
  if (an) return -1;
  if (bn) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** @id CODE-SEMV-002 @implements REQ-SEMV-003 REQ-SEMV-004 REQ-SEMV-005 REQ-SEMV-006 REQ-SEMV-007 */
export function compare(a, b) {
  const x = asV(a);
  const y = asV(b);
  for (const k of ['major', 'minor', 'patch']) {
    if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  }
  const px = x.prerelease;
  const py = y.prerelease;
  if (!px.length && !py.length) return 0;
  if (!px.length) return 1;
  if (!py.length) return -1;
  for (let i = 0; i < Math.min(px.length, py.length); i++) {
    const c = cmpId(px[i], py[i]);
    if (c) return c;
  }
  return px.length === py.length ? 0 : px.length < py.length ? -1 : 1;
}

/** @id CODE-SEMV-003 @implements REQ-SEMV-008 */
export function format(v) {
  let s = `${v.major}.${v.minor}.${v.patch}`;
  if (v.prerelease.length) s += `-${v.prerelease.join('.')}`;
  if (v.build.length) s += `+${v.build.join('.')}`;
  return s;
}

/** @id CODE-SEMV-004 @implements REQ-SEMV-009 */
export function inc(v, kind) {
  const x = asV(v);
  if (kind === 'major') return format({ major: x.major + 1, minor: 0, patch: 0, prerelease: [], build: [] });
  if (kind === 'minor') return format({ major: x.major, minor: x.minor + 1, patch: 0, prerelease: [], build: [] });
  if (kind === 'patch') {
    const bump = x.prerelease.length ? x.patch : x.patch + 1;
    return format({ major: x.major, minor: x.minor, patch: bump, prerelease: [], build: [] });
  }
  throw new SemverError(`unknown increment kind: ${kind}`);
}

/** @id CODE-SEMV-005 @implements REQ-SEMV-010 */
export function sortVersions(list) {
  return [...list].sort(compare);
}
