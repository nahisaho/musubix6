import { parse } from './semver.js';
import { ivEmpty, ivIntersect, normalize, contains, ivToString } from './intervals.js';

export class RangeSyntaxError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RangeSyntaxError';
  }
}

const mk = (major, minor, patch, pre = []) => ({ major, minor, patch, prerelease: pre, build: [] });
const next0 = (major, minor, patch) => mk(major, minor, patch, [0]);
const ZERO0 = next0(0, 0, 0);

const WILD = /^[xX*]$/;
const PART = /^(?:[xX*]|0|[1-9]\d*)$/;
const PARTIAL = /^(?:v?)([xX*]|\d+)(?:\.([xX*]|\d+))?(?:\.([xX*]|\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parsePartial(tok, whole) {
  const m = PARTIAL.exec(tok);
  const bad = () => new RangeSyntaxError(`invalid range token ${JSON.stringify(tok)} in ${JSON.stringify(whole)}`);
  if (!m) throw bad();
  const nums = [m[1], m[2], m[3]];
  let wildSeen = false;
  const parts = [];
  for (const p of nums) {
    if (p === undefined || WILD.test(p)) { wildSeen = true; parts.push(null); continue; }
    if (wildSeen || !PART.test(p)) throw bad();
    parts.push(Number(p));
  }
  let pre = [];
  if (m[4] !== undefined) {
    if (parts[2] === null) throw bad();
    pre = parse(`0.0.0-${m[4]}`).prerelease;
    if (!pre.length) throw bad();
  }
  return { major: parts[0], minor: parts[1], patch: parts[2], pre };
}

const full = (p) => mk(p.major, p.minor, p.patch, p.pre);

function lowOf(p) {
  return mk(p.major ?? 0, p.minor ?? 0, p.patch ?? 0, p.pre);
}

// exclusive upper bound of the partial's x-range
function highOf(p) {
  if (p.major === null) return null;
  if (p.minor === null) return next0(p.major + 1, 0, 0);
  if (p.patch === null) return next0(p.major, p.minor + 1, 0);
  return null;
}

const ALL = { lo: null, loInc: false, hi: null, hiInc: false };
const NONE = { lo: ZERO0, loInc: true, hi: ZERO0, hiInc: false };

function intervalFor(op, tok, whole) {
  const p = parsePartial(tok, whole);
  const isFull = p.patch !== null;
  const allWild = p.major === null;
  switch (op) {
    case '':
    case '=':
      if (allWild) return ALL;
      if (isFull) return { lo: full(p), loInc: true, hi: full(p), hiInc: true };
      return { lo: lowOf(p), loInc: true, hi: highOf(p), hiInc: false };
    case '>':
      if (allWild) return NONE;
      if (isFull) return { lo: full(p), loInc: false, hi: null, hiInc: false };
      return { lo: mk(...(p.minor === null ? [p.major + 1, 0, 0] : [p.major, p.minor + 1, 0])), loInc: true, hi: null, hiInc: false };
    case '>=':
      return allWild ? ALL : { lo: lowOf(p), loInc: true, hi: null, hiInc: false };
    case '<':
      return allWild ? NONE : { lo: null, loInc: false, hi: lowOf(p), hiInc: false };
    case '<=':
      if (allWild) return ALL;
      return isFull ? { lo: null, loInc: false, hi: full(p), hiInc: true } : { lo: null, loInc: false, hi: highOf(p), hiInc: false };
    case '~': {
      if (allWild) return ALL;
      const hi = p.minor === null ? next0(p.major + 1, 0, 0) : next0(p.major, p.minor + 1, 0);
      return { lo: lowOf(p), loInc: true, hi, hiInc: false };
    }
    case '^': {
      if (allWild) return ALL;
      let hi;
      if (p.major > 0 || p.minor === null) hi = next0(p.major + 1, 0, 0);
      else if (p.minor > 0 || p.patch === null) hi = next0(0, p.minor + 1, 0);
      else hi = next0(0, 0, p.patch + 1);
      return { lo: lowOf(p), loInc: true, hi, hiInc: false };
    }
    default:
      throw new RangeSyntaxError(`unknown operator ${JSON.stringify(op)} in ${JSON.stringify(whole)}`);
  }
}

const preKey = (v) => `${v.major}.${v.minor}.${v.patch}`;

function parseAlternative(src, whole) {
  const s = src.trim();
  const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(s);
  const pre = new Set();
  const note = (tok) => { const p = parsePartial(tok, whole); if (p.pre.length) pre.add(preKey(full(p))); return p; };
  if (hyphen) {
    const a = note(hyphen[1]);
    const b = note(hyphen[2]);
    const lo = a.major === null ? null : lowOf(a);
    let hi;
    let hiInc = false;
    if (b.major === null) hi = null;
    else if (b.patch === null) hi = highOf(b);
    else { hi = full(b); hiInc = true; }
    return { sets: [{ lo, loInc: lo !== null, hi, hiInc }], pre };
  }
  const tokens = s === '' ? [] : s.split(/\s+/);
  let iv = ALL;
  for (let i = 0; i < tokens.length; i++) {
    let t = tokens[i];
    const m = /^(<=|>=|<|>|=|~|\^)?(.*)$/.exec(t);
    let op = m[1] ?? '';
    let rest = m[2];
    if (rest === '') {
      if (!op || i + 1 >= tokens.length) throw new RangeSyntaxError(`missing version after ${JSON.stringify(t)} in ${JSON.stringify(whole)}`);
      rest = tokens[++i];
    }
    if (/^[<>=~^]/.test(rest)) throw new RangeSyntaxError(`invalid range token ${JSON.stringify(t + rest)} in ${JSON.stringify(whole)}`);
    note(rest);
    iv = ivIntersect(iv, intervalFor(op, rest, whole));
  }
  return { sets: [iv], pre };
}

/** @id CODE-RNG-002 @implements REQ-RNG-001 REQ-RNG-002 REQ-RNG-003 REQ-RNG-004 REQ-RNG-005 REQ-RNG-010 */
export function parseRange(input) {
  if (typeof input !== 'string') throw new RangeSyntaxError(`range must be a string, got ${typeof input}`);
  const sets = [];
  const pre = new Set();
  for (const alt of input.split('||')) {
    const r = parseAlternative(alt, input);
    sets.push(...r.sets);
    for (const k of r.pre) pre.add(k);
  }
  return { sets: normalize(sets), pre };
}

const asR = (r) => (typeof r === 'string' ? parseRange(r) : r);

/** @id CODE-RNG-003 @implements REQ-RNG-009 */
export function isEmpty(r) {
  return asR(r).sets.length === 0;
}

/** @id CODE-RNG-004 @implements REQ-RNG-007 */
export function satisfies(version, range) {
  const v = typeof version === 'string' ? parse(version) : version;
  const r = asR(range);
  if (v.prerelease.length && !r.pre.has(preKey(v))) return false;
  return r.sets.some((iv) => contains(iv, v));
}

/** @id CODE-RNG-005 @implements REQ-RNG-008 REQ-RNG-012 */
export function intersect(a, b) {
  const x = asR(a);
  const y = asR(b);
  const sets = [];
  for (const p of x.sets) for (const q of y.sets) sets.push(ivIntersect(p, q));
  return { sets: normalize(sets), pre: new Set([...x.pre].filter((k) => y.pre.has(k))) };
}

/** @id CODE-RNG-006 @implements REQ-RNG-011 */
export function rangeToString(r) {
  const { sets } = asR(r);
  return sets.length ? sets.map(ivToString).join(' || ') : '<0.0.0-0';
}
