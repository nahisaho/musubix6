# Plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | parse | - | AST + parser |
| 2 | types | - | terms, subst |
| 3 | unify | types | mgu |
| 4 | infer | parse, types, unify | algorithm W |
| 5 | pretty | types, parse | printers |
| 6 | report | infer, pretty, parse | errors, CLI |
