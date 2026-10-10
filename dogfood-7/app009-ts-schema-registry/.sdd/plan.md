| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | model | | AST, validation and fingerprints |
| 2 | compatibility | model | Reader/writer resolution |
| 3 | registry | model,compatibility | Atomic version registration |
| 4 | codec | model,compatibility | Safe fingerprint envelopes |
| 5 | migration | model,compatibility,codec | Auditable resolution plans |
