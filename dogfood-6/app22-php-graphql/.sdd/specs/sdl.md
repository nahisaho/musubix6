---
feature: sdl
tier: T2
approval: auto
---
# sdl
Goal: parse SDL documents into a definition AST.   Non-goals: directive definitions' locations validation, extend.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SDL-001 | When a `type` definition is parsed, the parser shall return an object definition with fields, argument lists, descriptions and implemented interfaces (`implements A & B`, legacy `implements A, B` accepted). | TEST-SDL-001 |
| REQ-SDL-002 | When a type reference is parsed, the parser shall build a nested TypeRef (named, list, non-null) so that `[[T!]!]!` round-trips via toString. | TEST-SDL-002 |
| REQ-SDL-003 | When `enum`, `union`, `scalar`, `input` and `interface` definitions are parsed, the parser shall return the matching definition kinds with their members. | TEST-SDL-003 |
| REQ-SDL-004 | When a default value or directive argument is parsed, the parser shall support int, float, string, boolean, null, enum, list and object literals. | TEST-SDL-004 |
| REQ-SDL-005 | When a `schema { query: Q mutation: M }` block is parsed, the parser shall record operation root type names. | TEST-SDL-005 |
| REQ-SDL-006 | When a definition has `@name(arg: v)` directives, the parser shall attach them to the definition, field, argument or enum value. | TEST-SDL-006 |
| REQ-SDL-007 | If the document has an unexpected token, then the parser shall throw SyntaxError naming the expected and found tokens with line and column. | TEST-SDL-007 |
| REQ-SDL-008 | If a type name is defined twice or a list/object/enum has a duplicate member, then the parser shall throw SyntaxError mentioning "duplicate". | TEST-SDL-008 |
| REQ-SDL-009 | When a block-string or string description precedes a definition or member, the parser shall store it as description. | TEST-SDL-009 |

## Design
Components: `Sdl\Parser` (recursive descent over `Lex\Lexer` tokens), `Sdl\TypeRef` (value object), `Sdl\Definition` (kind, name, fields, ...).
| State | Token | Next |
| --- | --- | --- |
| top | Name(type/enum/...) | definition by kind |
| top | StringValue/BlockString | description then definition |
| fields | `}` | close |
| value | `[` / `{` | recursive list/object |
Invariants: every definition name unique in document; every parse consumes all tokens up to EOF; TypeRef non-null never wraps non-null (`T!!` rejected); the parser never depends on a Schema.
## Assumptions / risks: legacy comma implements retired by TEST-SDL-001.
