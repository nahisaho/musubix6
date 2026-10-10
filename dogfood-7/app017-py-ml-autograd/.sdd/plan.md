| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | tensor | | Nine contracts including scalar reshape |
| 2 | autograd | tensor | Ten contracts including two gradient regressions |
| 3 | optim | autograd | Nine contracts including SGD checkpoint restore |
| 4 | layers | optim | Nine contracts including scalar state atomicity |
| 5 | gradcheck | layers | Ten contracts including overflow-safe differences |
