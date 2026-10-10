---
feature: parse
tier: T2
---
# parse
Goal: recursive-descent regex parser producing a normalised AST with positioned errors. Non-goals: lookaround, backreferences, flags, Unicode property classes.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PARSE-001 | When a pattern of plain characters is parsed, the system shall return `Concat` of `Literal`s (a single char yields bare `Literal`, empty pattern yields `Empty`). | TEST-PARSE-001 |
| REQ-PARSE-002 | When a pattern contains `\|`, the system shall return `Alt` whose branches are the sub-patterns, an empty branch being `Empty`. | TEST-PARSE-002 |
| REQ-PARSE-003 | When `*`, `+` or `?` follows an atom, the system shall return `Repeat` with (0,None), (1,None), (0,Some 1) respectively and greedy=true. | TEST-PARSE-003 |
| REQ-PARSE-004 | When `{n}`, `{n,}` or `{n,m}` follows an atom, the system shall return `Repeat` with those bounds; if n>m then error `BadRepeat`; if a bound exceeds 1000 then `RepeatTooBig`; an unterminated `{n` is `BadRepeat`. | TEST-PARSE-004 |
| REQ-PARSE-005 | When a quantifier is followed by `?`, the system shall set greedy=false; a second quantifier after a quantifier (e.g. `a**`, `a*+`) shall be error `DoubleRepeat`. | TEST-PARSE-005 |
| REQ-PARSE-006 | When `(` ... `)` is parsed, the system shall number capture groups by opening-paren order starting at 1, `(?:` shall create no index, and `Parsed.groups` shall equal the capture count. | TEST-PARSE-006 |
| REQ-PARSE-007 | When a bracket class is parsed, the system shall build a `ClassSet` whose ranges are sorted, disjoint and non-adjacent; `^` negates by complement over U+0000..U+10FFFF; a reversed range `[z-a]` is `BadRange`. | TEST-PARSE-007 |
| REQ-PARSE-008 | When `\d \w \s \D \W \S \n \t` or an escaped metacharacter is parsed, the system shall return the matching class/literal; a trailing `\` is `TrailingBackslash`; an unknown alphabetic escape is `BadEscape`. | TEST-PARSE-008 |
| REQ-PARSE-009 | When `.`, `^` or `$` is parsed, the system shall return `Any`, `Start`, `End`. | TEST-PARSE-009 |
| REQ-PARSE-010 | When parsing fails, the system shall report an `ErrorKind` and the char offset of the offending token (`)`→UnmatchedClose, unclosed `(`→UnclosedGroup at the `(`, `*a`→NothingToRepeat at 0, unclosed `[`→UnclosedClass). | TEST-PARSE-010 |
| REQ-PARSE-011 | While nesting depth of groups exceeds 200, the system shall return `TooDeep` instead of overflowing the stack. | TEST-PARSE-011 |
| REQ-PARSE-012 | For every parsed AST, `to_pattern()` re-parsed shall equal the original AST (round-trip). | TEST-PARSE-012 |

## Design
Components: `ClassSet` (normalised range set) · `Ast` · `Parser{chars,pos,depth,groups}` recursive descent: `alt → concat → repeat → atom`.
Parser states: Alt(expect branch) → Concat(expect atom/quantifier) → AfterAtom(quantifier allowed) → AfterQuant(only `?` lazy marker allowed; another quantifier ⇒ DoubleRepeat).

| Invariant | Enforced by |
| --- | --- |
| ClassSet ranges sorted, disjoint, non-adjacent | `ClassSet::from_ranges` normalises; negate = complement |
| Group indices unique, dense 1..=groups in open-paren order | counter incremented at `(` before parsing body |
| `Repeat.min <= max`, bounds <= 1000 | check at `}` |
| depth <= 200 | counter in `parse_group` |
| `Concat`/`Alt` hold >=2 items, never nested directly in same kind | smart constructors `concat`/`alt` |

| Input | Result |
| --- | --- |
| `` | Empty |
| `a\|` | Alt[Literal a, Empty] |
| `a**` | Err DoubleRepeat@2 |
| `a{3,2}` | Err BadRepeat |
| `[z-a]` | Err BadRange |
| `(a` | Err UnclosedGroup@0 |
## Assumptions / risks
Chars are Unicode scalar values; positions are char offsets (spiked: `chars().collect::<Vec<_>>()` indexing). Round trip needs escaping of metachars in `to_pattern` (REQ-012 retires it).
