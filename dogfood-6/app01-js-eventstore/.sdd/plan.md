| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | store | | event store core |
| 2 | snapshots | store | |
| 3 | inventory | | pure aggregate |
| 4 | orders | | pure state machine |
| 5 | projections | store, inventory, orders | |
| 6 | commands | store, snapshots, inventory, orders | |
