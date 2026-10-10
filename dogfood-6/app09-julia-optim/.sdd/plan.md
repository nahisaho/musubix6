# Plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | sparse | - | CSR matrix ops |
| 2 | lu | sparse | LU solve |
| 3 | newton | lu, sparse | Newton for systems |
| 4 | gradient | sparse | gradient descent |
