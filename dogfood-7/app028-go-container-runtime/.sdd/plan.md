| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | oci | - | Strict input boundary |
| 2 | fs | - | Layered filesystem |
| 3 | cg | oci | Atomic limits accounting |
| 4 | life | oci,fs,cg | Complete transition matrix |
| 5 | snap | life | Versioned checkpoint |
