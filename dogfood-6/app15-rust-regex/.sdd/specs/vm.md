---
feature: vm
tier: T2
---
# vm
Goal: compile the parse AST to a bytecode `Program` and run it on a Pike VM (breadth-first thread list, backtracking-free) with leftmost-first priority and capture slots. Depends on feature parse (`Parsed`, `Ast`, `ClassSet`). Non-goals: DFA acceleration, lookaround, backreferences.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-VM-001 | When a pattern is compiled, the system shall emit one `Char` instruction per literal and a final `Match`; `disassemble()` shall print `NNNN op operands` lines. | TEST-VM-001 |
| REQ-VM-002 | When an alternation is compiled, the system shall emit `Split(first, second)` + `Jmp end` so earlier branches have priority (`a\|ab` on "ab" matches "a"; `ab\|a` matches "ab"). | TEST-VM-002 |
| REQ-VM-003 | When a greedy `*` is compiled, the system shall emit `Split(body, exit)`; a lazy `*?` shall emit `Split(exit, body)` (`a*` vs `a*?` on "aaa" match 3 vs 0 chars). | TEST-VM-003 |
| REQ-VM-004 | When `{n,m}` is compiled, the system shall emit n mandatory copies then m-n nested optionals, greedy or lazy (`a{2,3}` on "aaaa" matches 3, `a{2,3}?` matches 2). | TEST-VM-004 |
| REQ-VM-005 | When groups are compiled, the system shall emit `Save(2i)`/`Save(2i+1)`; matching shall report byte-offset spans per group and `None` for groups that did not participate. | TEST-VM-005 |
| REQ-VM-006 | `find_at(input, at)` shall return the leftmost match starting at or after byte offset `at`, preferring higher-priority threads among equal starts. | TEST-VM-006 |
| REQ-VM-007 | `^` shall match only at byte 0 of the whole input (not at `at`) and `$` only at the end of the whole input. | TEST-VM-007 |
| REQ-VM-008 | While the body of a loop can match the empty string, the VM shall terminate and not repeat empty iterations (`(a*)*` on "b" matches empty with group 1 `None`; on "aab" group 1 = (0,2)). | TEST-VM-008 |
| REQ-VM-009 | When a loop iterates over a group, captures of the last successful iteration shall persist (`(?:(a)\|b)+` on "ab": group 1 = (0,1)). | TEST-VM-009 |
| REQ-VM-010 | The VM shall run in O(len * program size): the live thread count shall never exceed the program length (`(a?){25}a{25}` on 25 a's). | TEST-VM-010 |
| REQ-VM-011 | If the compiled program would exceed 100000 instructions, then `compile` shall return `CompileError::TooBig`. | TEST-VM-011 |
| REQ-VM-012 | The VM shall consume whole Unicode scalars: `.` matches a multi-byte char, offsets are byte offsets on char boundaries, and `find_at` with an `at` inside a char or beyond the input returns `None`. | TEST-VM-012 |

## Design
Components: `Inst` · `compile` (emit with patch lists) · `ThreadList` (sparse set keyed by pc + slot vectors, ordered by priority) · `add_thread` (explicit stack, `Restore` frames undo `Save`) · `step`.

| Inst | Operands | Effect |
| --- | --- | --- |
| Char | c | consume equal char |
| Any | - | consume any char except `\n` |
| Class | set | consume char in set |
| Split | x, y | fork; x has priority |
| Jmp | t | goto |
| Save | slot | record position |
| AssertStart / AssertEnd | - | zero-width at 0 / len |
| Match | - | accept; lower-priority threads are cut |

| Invariant | Enforced by |
| --- | --- |
| each pc appears at most once per thread list | visited set keyed by pc |
| thread order == priority order | add_thread DFS order x before y |
| slots length = 2*(groups+1) | `find_at` allocates |
| no thread after a higher-priority Match | break in step loop |
## Assumptions / risks
Priority + visited-set gives RE2 semantics; empty-iteration behaviour is a documented consequence (REQ-VM-008). Stack depth is not recursive (explicit stack), so programs of 100000 instructions are safe.
