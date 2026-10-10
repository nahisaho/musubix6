# Plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | lexer | - | tokenizer |
| 2 | parser | lexer | recursive descent, AST |
| 3 | catalog | - | schemas, typed storage |
| 4 | expr | parser | NULL three-valued evaluation |
| 5 | planner | parser, catalog, expr | pushdown, join strategy |
| 6 | executor | lexer, parser, catalog, expr, planner | joins, group-by, aggregates |
| 7 | fixes | planner, executor | regression fixes found by probing |
