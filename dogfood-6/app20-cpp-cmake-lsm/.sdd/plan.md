# Plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | bloom | - | hash + bit filter |
| 2 | memtable | bloom | skiplist, versions, tombstones |
| 3 | sstable | bloom, memtable | block format, reader/writer |
| 4 | compaction | sstable, memtable | merge iterator, GC rules |
| 5 | db | compaction, sstable, memtable, bloom | levels, snapshots, RAII |
