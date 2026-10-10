---
feature: model
tier: T2
---
# model
Goal: parse BPMN-lite text into an immutable, validated ProcessModel. Non-goals: BPMN XML, layout.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-MODEL-001 | When a `process <id>` document with `start`, `task`, `end` nodes and `flow a -> b` lines is parsed, the parser shall return a ProcessModel with the nodes and flows in declaration order. | TEST-MODEL-001 |
| REQ-MODEL-002 | When a line is blank or starts with `#`, the parser shall ignore it. | TEST-MODEL-002 |
| REQ-MODEL-003 | If a line is not a known statement, then the parser shall throw ParseException carrying the 1-based line number. | TEST-MODEL-003 |
| REQ-MODEL-004 | When a node line has `key=value` or `key="quoted value"` attributes, the parser shall store them on the node. | TEST-MODEL-004 |
| REQ-MODEL-005 | When a flow line ends with `when <expr>` the parser shall store the expression text as the flow condition, and with `default` shall mark the flow as default. | TEST-MODEL-005 |
| REQ-MODEL-006 | If two nodes share an id, then validation shall report DUPLICATE_ID. | TEST-MODEL-006 |
| REQ-MODEL-007 | If a flow references an unknown node, then validation shall report UNKNOWN_NODE. | TEST-MODEL-007 |
| REQ-MODEL-008 | If the model does not have exactly one start node, then validation shall report START_COUNT; if it has no end node, then validation shall report NO_END. | TEST-MODEL-008 |
| REQ-MODEL-009 | If a node is not reachable from start, or cannot reach any end node, then validation shall report UNREACHABLE or DEAD_END respectively. | TEST-MODEL-009 |
| REQ-MODEL-010 | If an exclusive gateway splits and has more than one default flow, or a non-default flow without condition (except when it is the only outgoing flow), then validation shall report XOR_FLOWS. | TEST-MODEL-010 |
| REQ-MODEL-011 | If a parallel gateway has both several incoming and several outgoing flows, then validation shall report AND_MIXED. | TEST-MODEL-011 |
| REQ-MODEL-012 | When validation finds several problems, it shall return all of them sorted by code then subject, deterministically. | TEST-MODEL-012 |

## Design
Components: `ProcessParser` (line tokenizer -> `ProcessModel`), `ModelValidator` (pure function model -> sorted `List<Issue>`), records `Node`, `Flow`, `Issue`.
Data flow: text -> tokens (quote aware) -> statements -> ProcessModel (immutable lists, index maps) -> validator.

| Statement | Form | Result |
| --- | --- | --- |
| process | `process <id>` | sets model id |
| node | `<start\|end\|task\|xor\|and\|timer> <id> [k=v ...]` | Node |
| flow | `flow <a> -> <b> [when <expr> \| default]` | Flow |

| Invariant | Enforced by |
| --- | --- |
| node ids unique | validator DUPLICATE_ID |
| flow endpoints exist | validator UNKNOWN_NODE |
| exactly one start, >=1 end | START_COUNT / NO_END |
| every node on a start->end path | UNREACHABLE (forward BFS) / DEAD_END (backward BFS) |
| xor split: <=1 default, others conditioned | XOR_FLOWS |
| and gateway is pure split or pure join | AND_MIXED |

## Assumptions / risks
Parser is lenient on duplicates (validator reports them); quoted values may contain spaces and `#` (TEST-MODEL-004).
