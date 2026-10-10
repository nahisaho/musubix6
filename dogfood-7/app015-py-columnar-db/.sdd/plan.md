| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | encoding | | Dictionary and run-length compression |
| 2 | storage | encoding | Immutable tables and zone maps |
| 3 | operators | storage | Vectorized relational operators |
| 4 | joins | operators | Bag-preserving equijoins |
| 5 | planner | joins,storage,operators | Costed executable physical plans |
