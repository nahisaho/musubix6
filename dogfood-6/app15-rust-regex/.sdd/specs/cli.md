---
feature: cli
tier: T1
---
# cli
Goal: `rx` command line over the engine: match, full, find-all, captures, replace, split, dfa, prog, equiv. Depends on feature engine (and vm/dfa/nfa for `prog`/`dfa`). Non-goals: files, colours, flags.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CLI-001 | When called with no arguments or an unknown subcommand, the system shall print usage to stderr and exit 2; `--help` shall print usage to stdout and exit 0. | TEST-CLI-001 |
| REQ-CLI-002 | `match <pattern> <text>` shall print the leftmost match and exit 0, or print nothing and exit 1. | TEST-CLI-002 |
| REQ-CLI-003 | `full <pattern> <text>` shall exit 0 when the whole text matches and 1 otherwise. | TEST-CLI-003 |
| REQ-CLI-004 | `find-all <pattern> <text>` shall print one `start..end<TAB>text` line per match, also for empty matches in multi-byte text. | TEST-CLI-004 |
| REQ-CLI-005 | `captures <pattern> <text>` shall print `i: "text"` per group and `i: none` for unmatched groups. | TEST-CLI-005 |
| REQ-CLI-006 | `replace <pattern> <text> <template>` shall print the replaced text. | TEST-CLI-006 |
| REQ-CLI-007 | If the pattern is invalid, then the system shall print `error: <Kind> at <pos>` to stderr and exit 2. | TEST-CLI-007 |
| REQ-CLI-008 | `dfa <pattern>` shall print `states: N` (minimal), `classes: C`, `live: L`; for anchored patterns it shall print `error: unsupported` and exit 2. | TEST-CLI-008 |
| REQ-CLI-009 | `prog <pattern>` shall print the bytecode disassembly. | TEST-CLI-009 |
| REQ-CLI-010 | `equiv <p1> <p2>` shall print `equivalent` (exit 0) or `different` (exit 1). | TEST-CLI-010 |
| REQ-CLI-011 | When the text argument is `-`, the system shall read the text from stdin. | TEST-CLI-011 |
| REQ-CLI-012 | `split <pattern> <text>` shall print one field per line, and a missing argument shall give `error: missing argument` and exit 2; the `rx` binary shall propagate the exit code. | TEST-CLI-012 |

## Assumptions / risks
`run` is a pure function (args, stdin) -> (code, stdout, stderr) so tests need no process spawning except REQ-CLI-012's binary check.
