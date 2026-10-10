# Plan
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | model | - | parser + validator (bpmn-model) |
| 2 | tokens | model | token execution (bpmn-engine) |
| 3 | gateways | tokens, model | conditions, xor/and (bpmn-engine) |
| 4 | timers | tokens | clock, durations, timer queue (bpmn-timer) |
| 5 | comp | tokens, gateways | compensation (bpmn-comp) |
