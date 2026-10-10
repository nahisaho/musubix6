---
feature: range
tier: T2
---
# range
Goal: parse npm-style ranges into normalized interval sets; satisfy and intersect them. Non-goals: loose mode, includePrerelease flag.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-RNG-001 | When a range uses comparators `<`,`<=`,`>`,`>=`,`=` or a bare version, the system shall yield the matching interval; comparators joined by whitespace intersect. | TEST-RNG-001 |
| REQ-RNG-002 | When a range uses x-ranges (`1.x`, `1.2.*`, `*`, empty), the system shall expand them to [lo, next-0). | TEST-RNG-002 |
| REQ-RNG-003 | When a range uses tilde, `~1.2.3` shall mean >=1.2.3 <1.3.0-0 and `~1` shall mean >=1.0.0 <2.0.0-0. | TEST-RNG-003 |
| REQ-RNG-004 | When a range uses caret, the leftmost non-zero part shall be locked (`^1.2.3`, `^0.2.3`, `^0.0.3`, `^0.0`). | TEST-RNG-004 |
| REQ-RNG-005 | When a range is a hyphen range, partial upper bounds shall be inclusive of the partial (`1.2 - 2.3` = >=1.2.0 <2.4.0-0). | TEST-RNG-005 |
| REQ-RNG-006 | When a range has `||` alternatives, the system shall normalize to sorted, disjoint, non-adjacent intervals. | TEST-RNG-006 |
| REQ-RNG-007 | When satisfies(v, r) is called with a prerelease v, the system shall accept it only if some comparator of r names a prerelease of the same M.m.p. | TEST-RNG-007 |
| REQ-RNG-008 | When intersect(a, b) is called, the system shall return a range whose satisfying set is exactly the set intersection. | TEST-RNG-008 |
| REQ-RNG-009 | When the satisfying set is empty (e.g. `>2.0.0 <1.0.0`), isEmpty shall be true and no version shall satisfy it. | TEST-RNG-009 |
| REQ-RNG-010 | If a range string is malformed, then parseRange shall throw RangeSyntaxError naming the bad token. | TEST-RNG-010 |
| REQ-RNG-011 | When rangeToString(r) is parsed again, the system shall produce an equivalent interval set. | TEST-RNG-011 |
| REQ-RNG-012 | When intersect(a, b) is called, a prerelease version shall satisfy the result only if it satisfies both a and b (bug fix: the prerelease allowance must be the intersection, not the union). | TEST-RNG-012 |

## Design
Components: `intervals.js`-style pure interval algebra inside range.js; Range = {sets: Interval[], pre: Set<"M.m.p">}.
Interval = {lo: Version|null, loInc: bool, hi: Version|null, hiInc: bool}; null = unbounded.
Data flow: string → split on `||` → per-alternative comparator list → interval intersection → union normalize.

| State/invariant | Rule |
| --- | --- |
| sorted | sets ordered by lo ascending (null lo first) |
| disjoint | no two sets overlap or touch (touching with one side inclusive merges) |
| non-empty | every stored interval has lo<hi, or lo==hi with both inclusive |
| upper bounds | caret/tilde/x use exclusive `next-0`, so `2.0.0-alpha` is excluded |
| pre | gathered from comparators with prerelease; intersect keeps only tuples present on both sides |

## Assumptions / risks
Prerelease rule approximated per-range (not per-comparator-set); retired by TEST-RNG-007.
