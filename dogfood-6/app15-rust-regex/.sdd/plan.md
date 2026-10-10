# plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | parse | - | AST + parser (rx-syntax) |
| 2 | nfa | parse | Thompson NFA (rx-nfa) |
| 3 | dfa | nfa | subset construction + minimisation (rx-dfa) |
| 4 | vm | parse | bytecode + Pike VM with captures (rx-vm) |
| 5 | engine | parse, dfa, vm | Regex facade, find/captures/replace (rx-engine) |
| 6 | cli | engine | rx binary (rx-cli) |
