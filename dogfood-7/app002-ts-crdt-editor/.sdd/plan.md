| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | seq | - | RGA operation algebra and validation |
| 2 | causal | seq | Replica clocks and causal buffer |
| 3 | history | causal | Local intention undo and redo |
| 4 | cursor | seq | Stable anchored cursor mapping |
| 5 | convergence | history,cursor | Seeded adversarial network properties |
