---
feature: query
tier: T2
approval: auto
---
# query
Goal: parse executable documents and validate them against a Schema.   Non-goals: subscriptions.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-QRY-001 | When a document is parsed, the parser shall return operations (query/mutation, optional name) and fragments; `{ a }` shorthand is an anonymous query. | TEST-QRY-001 |
| REQ-QRY-002 | When fields have aliases and arguments, the parser shall record alias, name and argument values (variables, literals, lists, objects). | TEST-QRY-002 |
| REQ-QRY-003 | When variable definitions `($a: Int = 3, $b: [ID!]!)` are parsed, the parser shall record types and defaults. | TEST-QRY-003 |
| REQ-QRY-004 | When `...Name`, `... on T { }` and `... @include(if: $x) { }` are parsed, the parser shall create FragmentSpread and InlineFragment nodes with directives. | TEST-QRY-004 |
| REQ-QRY-005 | If a document has duplicate operation names, an anonymous op with other ops, or duplicate fragment names, then validation shall report an error. | TEST-QRY-005 |
| REQ-QRY-006 | If a selected field does not exist on the parent type, or a leaf has a subselection or a composite lacks one, then validation shall report an error. | TEST-QRY-006 |
| REQ-QRY-007 | If a fragment spread is undefined, unused or forms a cycle (direct or indirect), then validation shall report an error. | TEST-QRY-007 |
| REQ-QRY-008 | If a variable is used but undefined, defined but unused (also via fragments), or its type is not allowed in the argument position, then validation shall report an error. | TEST-QRY-008 |
| REQ-QRY-009 | If an argument is unknown, duplicated, a required argument is missing, a literal does not fit its argument type, or a directive is unknown or lacks its `if` argument, then validation shall report an error. | TEST-QRY-009 |
| REQ-QRY-010 | If fields with the same response key conflict (different name/args or incompatible types) within one selection set after fragment merging, then validation shall report an error. | TEST-QRY-010 |
| REQ-QRY-011 | If a fragment type condition cannot overlap the parent type, then validation shall report an error. | TEST-QRY-011 |

## Design
Components: `Query\Parser` (uses `Lex\Lexer`, `Sdl\Parser::parseValue`), `Query\Ast\*` (nodes), `Query\Validator` (needs `Schema\Schema`).
| Rule | Walk | Data |
| --- | --- | --- |
| field-exists | selection tree | parent type |
| fragment-cycle | fragment spread graph | DFS colours |
| var-usage | operation + transitively reachable fragments | used set |
| var-position | arg position | `T!` var allowed for `T`; nullable var with default allowed for `T!` |
| merge-conflict | collected fields by response key | same name+args; leaf types equal |
| overlap | type condition vs parent | possibleTypes intersect |
Invariants: parser output is a pure AST (no schema); validator returns all errors; fragment cycle detection terminates on any graph.
## Assumptions / risks: variable-position rule retired by TEST-QRY-008.
