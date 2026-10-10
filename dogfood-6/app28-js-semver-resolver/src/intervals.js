import { compare, format } from './semver.js';

export const cmpLo = (a, b) => {
  if (a.lo === null || b.lo === null) return a.lo === b.lo ? 0 : a.lo === null ? -1 : 1;
  const c = compare(a.lo, b.lo);
  if (c) return c;
  return a.loInc === b.loInc ? 0 : a.loInc ? -1 : 1;
};

export const cmpHi = (a, b) => {
  if (a.hi === null || b.hi === null) return a.hi === b.hi ? 0 : a.hi === null ? 1 : -1;
  const c = compare(a.hi, b.hi);
  if (c) return c;
  return a.hiInc === b.hiInc ? 0 : a.hiInc ? 1 : -1;
};

export function ivEmpty(iv) {
  if (iv.lo === null || iv.hi === null) return false;
  const c = compare(iv.lo, iv.hi);
  return c > 0 || (c === 0 && !(iv.loInc && iv.hiInc));
}

export function ivIntersect(a, b) {
  const lo = cmpLo(a, b) >= 0 ? a : b;
  const hi = cmpHi(a, b) <= 0 ? a : b;
  return { lo: lo.lo, loInc: lo.loInc, hi: hi.hi, hiInc: hi.hiInc };
}

/** @id CODE-RNG-001 @implements REQ-RNG-006 REQ-RNG-009 */
export function normalize(list) {
  const live = list.filter((iv) => !ivEmpty(iv)).sort(cmpLo);
  const out = [];
  for (const iv of live) {
    const cur = out[out.length - 1];
    if (cur) {
      const touches = cur.hi === null || iv.lo === null
        || compare(iv.lo, cur.hi) < 0
        || (compare(iv.lo, cur.hi) === 0 && (cur.hiInc || iv.loInc));
      if (touches) {
        if (cmpHi(iv, cur) > 0) { cur.hi = iv.hi; cur.hiInc = iv.hiInc; }
        continue;
      }
    }
    out.push({ ...iv });
  }
  return out;
}

export function contains(iv, v) {
  if (iv.lo !== null) {
    const c = compare(v, iv.lo);
    if (c < 0 || (c === 0 && !iv.loInc)) return false;
  }
  if (iv.hi !== null) {
    const c = compare(v, iv.hi);
    if (c > 0 || (c === 0 && !iv.hiInc)) return false;
  }
  return true;
}

export function ivToString(iv) {
  if (iv.lo === null && iv.hi === null) return '*';
  if (iv.lo !== null && iv.hi !== null && iv.loInc && iv.hiInc && compare(iv.lo, iv.hi) === 0) return format(iv.lo);
  const parts = [];
  if (iv.lo !== null) parts.push(`${iv.loInc ? '>=' : '>'}${format(iv.lo)}`);
  if (iv.hi !== null) parts.push(`${iv.hiInc ? '<=' : '<'}${format(iv.hi)}`);
  return parts.join(' ');
}

