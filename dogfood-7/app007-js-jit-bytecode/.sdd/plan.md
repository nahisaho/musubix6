| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | caches | | Object shapes and branded property protocol |
| 2 | bytecode | caches | Checked bytecode and interpreter |
| 3 | allocation | bytecode | CFG liveness and physical registers |
| 4 | collection | caches | Stable handles and compacting heap |
| 5 | tiering | bytecode, allocation, caches, collection | Speculation and deoptimization |
