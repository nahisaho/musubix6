---
feature: dfa
tier: T2
---
# dfa
Goal: complete DFA over a code-point partition built by subset construction from the NFA, with Hopcroft minimisation, canonical numbering and language algebra. Depends on feature nfa (`Nfa`, `State`) and parse. Non-goals: anchors, captures, lazy DFA.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DFA-001 | When a DFA is built, the system shall partition U+0000..U+10FFFF into contiguous classes whose boundaries are the range starts and `hi+1` of every NFA `Class` set; `class_of(c)` shall return the class index of `c`. | TEST-DFA-001 |
| REQ-DFA-002 | When subset construction finishes, the system shall have a transition for every (state, class), with an explicit dead state for the empty subset. | TEST-DFA-002 |
| REQ-DFA-003 | For every input string, the DFA shall accept iff the source NFA accepts. | TEST-DFA-003 |
| REQ-DFA-004 | If the NFA contains `AssertStart` or `AssertEnd`, then `from_nfa` shall return `DfaError::Unsupported`. | TEST-DFA-004 |
| REQ-DFA-005 | If subset construction would exceed 10000 DFA states, then it shall return `DfaError::TooManyStates`. | TEST-DFA-005 |
| REQ-DFA-006 | `minimize` shall merge language-equivalent states by Hopcroft partition refinement (e.g. `a(b\|c)\|d(b\|c)` shrinks from 5 to 4 states) and drop unreachable states. | TEST-DFA-006 |
| REQ-DFA-007 | `minimize` shall be idempotent and language preserving. | TEST-DFA-007 |
| REQ-DFA-008 | `minimize` shall merge adjacent classes with identical transition columns and number states canonically (BFS from start, class order) so equal languages yield `==` DFAs; `equivalent(a, b)` shall decide language equality even for different alphabets. | TEST-DFA-008 |
| REQ-DFA-009 | `complement` shall flip acceptance and `intersect` shall build the product automaton; `is_empty` shall report whether no accepting state is reachable. | TEST-DFA-009 |
| REQ-DFA-010 | `shortest_match` shall return the shortest accepted string (ties: lowest class index) or `None`; `representative(class)` shall never yield a surrogate and shall be `None` for all-surrogate classes. | TEST-DFA-010 |
| REQ-DFA-011 | `is_match` shall run in O(len) with no per-char allocation and handle multi-byte chars and 200k-char input. | TEST-DFA-011 |
| REQ-DFA-012 | `live_states` shall list states from which an accepting state is reachable; the dead state shall not be listed. | TEST-DFA-012 |

## Design
Components: `Dfa{bounds, trans(flat state*ncls+cls), accept, start}` · subset builder (HashMap<Vec<usize>, id> over important NFA states = Class+Match) · Hopcroft refiner (inverse transitions, worklist) · canonicaliser (BFS renumber) · product builder over a common refinement of two alphabets.

| Invariant | Enforced by |
| --- | --- |
| bounds[0]==0, strictly increasing, all <= 0x10FFFF | collected into BTreeSet |
| trans.len() == states * classes, all targets < states | construction + `refine` |
| minimised DFA: no unreachable states, no two equivalent states, BFS numbering | `minimize` |
| product alphabets identical | `refine(bounds_union)` before product |

| Operation | Alphabet effect |
| --- | --- |
| from_nfa | partition from NFA class sets |
| intersect / equivalent | both operands refined to boundary union |
| complement | unchanged |
## Assumptions / risks
Surrogates never occur in `char`, but class partitions span them; spike showed `char::from_u32(0xD800)` is None, so representatives skip them (REQ-DFA-010). Exponential blowup bounded by REQ-DFA-005.
