| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | text | - | Versioned UTF-16 document transactions |
| 2 | parser | text | Incremental line checkpoints and recovery |
| 3 | symbols | parser | Lexical binding and shadowing |
| 4 | navigation | symbols,text | Definition and atomic rename |
| 5 | diagnostics | navigation,parser | Diagnostics and versioned quick fixes |
