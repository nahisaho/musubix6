---
feature: engine
tier: T2
---
# engine
Goal: `Regex` facade over parse, vm and dfa: leftmost-first search, whole-input matching with a minimised-DFA fast path, captures, iteration, replacement, split and language equivalence. Depends on features parse, vm, dfa (and nfa transitively). Non-goals: named groups, flags, streaming input.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ENGINE-001 | When `Regex::new` receives an invalid pattern, the system shall return `Error::Parse` carrying the parser error; when the program is too large it shall return `Error::Compile`. | TEST-ENGINE-001 |
| REQ-ENGINE-002 | `find` shall return the leftmost-first match with byte `start`, `end` and `as_str`, or `None`. | TEST-ENGINE-002 |
| REQ-ENGINE-003 | `is_match` shall report whether any substring matches; `full_match` shall report whether the whole input is matched by some path (`a\|ab` full-matches "ab" although `find` yields "a"). | TEST-ENGINE-003 |
| REQ-ENGINE-004 | While a pattern has no anchors and its DFA fits the state limit, `uses_dfa()` shall be true and `full_match` shall run on the minimised DFA; otherwise `full_match` shall fall back to the NFA and give identical answers. | TEST-ENGINE-004 |
| REQ-ENGINE-005 | `captures` shall return a `Captures` with `len() == group_count()+1`, `get(i)` spans and `None` for non-participating groups. | TEST-ENGINE-005 |
| REQ-ENGINE-006 | `find_all` shall return successive non-overlapping matches; an empty match directly after the previous match end shall not be reported, and the search shall advance past empty matches. | TEST-ENGINE-006 |
| REQ-ENGINE-007 | `replace_all` shall expand `$0`, `$n`, `${n}` and `$$` in the replacement; an unmatched or nonexistent group expands to the empty string. | TEST-ENGINE-007 |
| REQ-ENGINE-008 | `replace_all` shall also replace empty matches (`x*` with `-` on "abc" gives `-a-b-c-`). | TEST-ENGINE-008 |
| REQ-ENGINE-009 | `split` shall return the fields between matches, keeping leading/trailing empty fields; with no match it shall return the whole input. | TEST-ENGINE-009 |
| REQ-ENGINE-010 | `captures_all` shall return captures for every non-overlapping match in order. | TEST-ENGINE-010 |
| REQ-ENGINE-011 | `group_count()` shall equal the number of capture groups and `pattern()` the source text. | TEST-ENGINE-011 |
| REQ-ENGINE-012 | `equivalent_to(other)` shall decide language equality via minimised DFAs, and return `Error::Unsupported` when either side has no DFA. | TEST-ENGINE-012 |
| REQ-ENGINE-013 | When an empty match is skipped or consumed during iteration, `find_all`, `captures_all`, `replace_all` and `split` shall advance by the UTF-8 length of the next character, never into the middle of a code point. | TEST-ENGINE-013 |
| REQ-ENGINE-014 | In a replacement template, `$` followed by digits shall name the group by the full decimal number (`$10` is group 10, not group 1 followed by `0`); `${1}0` shall be group 1 followed by `0`; a group number beyond `group_count()` shall expand to the empty string. | TEST-ENGINE-014 |

## Design
Components: `Regex{pattern, prog: Program, nfa: Nfa, dfa: Option<Dfa>}` · `Match` / `Captures` views borrowing the text · expansion routine for replacement templates.

| Operation | Backend | Notes |
| --- | --- | --- |
| find / captures / find_all | vm Pike VM | leftmost-first |
| full_match | dfa (if present) else nfa | whole-input |
| equivalent_to | dfa algebra | both DFAs needed |

| Invariant | Enforced by |
| --- | --- |
| spans are byte offsets on char boundaries | VM guarantee (REQ-VM-012) |
| find_all matches are disjoint and increasing | iteration cursor `pos >= last_end` |
| no empty match adjacent to previous end | `skip_adjacent_empty` check |
| `dfa` present iff pattern anchor-free and DFA within 10000 states | `Dfa::from_nfa` result |

| Replacement token | Expansion |
| --- | --- |
| `$0` | whole match |
| `$n` / `${n}` | group n or empty |
| `$$` | literal `$` |
| other `$x` | literal `$x` |
## Assumptions / risks
Empty-match advance on multi-byte text is the risky edge (cursor must move by `len_utf8`); to be verified by the CLI feature tests. `full_match` via DFA vs NFA parity retired by REQ-ENGINE-004.
