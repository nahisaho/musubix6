| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | arena | | bump allocator |
| 2 | lexer | | streaming tokenizer |
| 3 | parser | arena, lexer | DOM + errors with paths |
| 4 | writer | parser | serializer |
| 5 | regex | | mini backtracking regex |
| 6 | schema | arena, parser, regex | validator |
