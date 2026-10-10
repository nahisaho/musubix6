# Plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | lex | - | tokenizer |
| 2 | sdl | lex | SDL parser |
| 3 | schema | sdl | schema build + validation |
| 4 | query | lex, schema | query parser + validation |
| 5 | exec | query, schema | executor |
