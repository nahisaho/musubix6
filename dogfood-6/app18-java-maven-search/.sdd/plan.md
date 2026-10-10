# Plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | analysis | - | tokenizer, filters, Porter stemmer (sx-analysis, sx-core Token) |
| 2 | codec | - | VByte, gap, frame-of-reference (sx-codec) |
| 3 | index | analysis, codec | inverted index, compressed postings (diamond via sx-core) |
| 4 | rank | index | BM25 + top-k |
| 5 | query | analysis | lexer, parser, simplifier |
| 6 | engine | index, rank, query, analysis | boolean/phrase evaluation, search |
