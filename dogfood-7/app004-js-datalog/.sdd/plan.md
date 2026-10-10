# Datalog delivery
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | parser | - | typed AST |
| 2 | stratify | parser | safety and signed dependencies |
| 3 | evaluate | parser,stratify | delta fixed point |
| 4 | magic | evaluate,stratify | demand propagation |
| 5 | provenance | evaluate | bounded proof graph |
