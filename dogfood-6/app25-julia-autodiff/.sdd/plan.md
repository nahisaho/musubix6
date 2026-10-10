# Plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | tensor | - | N-d tensor + broadcasting |
| 2 | rng | - | xorshift64* |
| 3 | tape | tensor | graph + backward |
| 4 | ops | tensor, tape | differentiable ops |
| 5 | gradcheck | ops, tape, tensor | numerical check |
| 6 | data | rng, tensor | datasets |
| 7 | nn | ops, tape, tensor, rng | layers, losses, sgd |
| 8 | train | nn, data, ops, tape, rng | loop |
