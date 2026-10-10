# Plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | semver | | version parse/compare/precedence |
| 2 | range | semver | range grammar, interval sets, intersection |
| 3 | peer | range | peer dependency requirements and validation |
| 4 | resolver | peer | backtracking resolver, conflict explanation |
| 5 | lock | resolver | deterministic lockfile writer/verifier |
