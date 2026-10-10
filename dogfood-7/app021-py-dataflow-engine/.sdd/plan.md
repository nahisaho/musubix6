| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | clock | - | event time and monotonicity |
| 2 | window | clock | half-open windows and sessions |
| 3 | state | clock | keyed numeric operators |
| 4 | flow | window,state | late policies and emission |
| 5 | snapshot | flow | integrity and replay |
