# Plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | source | - | positions, line index |
| 2 | combinators | source | parser combinator core |
| 3 | errors | combinators | furthest failure, labels, cut |
| 4 | pratt | combinators, errors | operator-precedence builder |
| 5 | lang | pratt, errors | tokens, AST, grammar |
| 6 | interp | lang | closures, evaluator |
| 7 | recovery | lang, errors | multi-diagnostic parsing |
