# LSM feature sequence
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | mem | | MVCC versions and range scans |
| 2 | sst | mem | immutable sorted files and bloom |
| 3 | wal | mem | framed sync and recovery |
| 4 | engine | mem,sst,wal | snapshots and atomic flush |
| 5 | compact | engine,sst | tiered and leveled policy |
