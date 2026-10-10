---
feature: automata
tier: T2
approval: auto
---
# Automata
Goal: Bound regular execution and preserve ordered quantifier semantics.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-AUTOMATA-001 | When a regular expression is compiled, fullmatch shall use a Thompson NFA. | TEST-AUTOMATA-001 |
| REQ-AUTOMATA-002 | When a regular NFA accepts, it shall consume the whole input for fullmatch. | TEST-AUTOMATA-001 |
| REQ-AUTOMATA-003 | When greedy quantifiers run through match, the engine shall try another iteration before stopping, retaining left-first alternatives. | TEST-AUTOMATA-002 |
| REQ-AUTOMATA-004 | When lazy quantifiers run through match, the engine shall try stopping before another iteration, retaining left-first alternatives. | TEST-AUTOMATA-002 |
| REQ-AUTOMATA-005 | When possessive quantifiers consume input, later nodes shall not reclaim it. | TEST-AUTOMATA-003 |
| REQ-AUTOMATA-006 | When atomic groups complete, later nodes shall not reopen their alternatives. | TEST-AUTOMATA-003 |
| REQ-AUTOMATA-007 | When bounded quantifiers run, minimum and maximum counts shall be enforced. | TEST-AUTOMATA-004 |
| REQ-AUTOMATA-008 | If a quantifier has reversed or oversized bounds, the compiler shall reject it. | TEST-AUTOMATA-004 |
| REQ-AUTOMATA-009 | When nullable expressions repeat, the engine shall terminate while satisfying finite required repetitions. | TEST-AUTOMATA-005 |
| REQ-AUTOMATA-010 | When regular adversarial alternatives run, NFA execution shall avoid exponential path enumeration. | TEST-AUTOMATA-005 |
| REQ-AUTOMATA-011 | When ordered unbounded repetition completes an empty iteration, it shall commit that path and captures before stopping further nonrequired empty iterations; finite repetitions shall explore to their maximum. | TEST-AUTOMATA-006 TEST-AUTOMATA-007 |
## Design
Thompson edges have consuming predicates or epsilon; closure deduplicates states.
Fullmatch without observable captures/assertions/ordered cuts uses NFA; prefix matching uses ordered VM.
## Assumptions
Repeat counts at most 1000; finite required empty iterations are allowed. Spike: nullable closure must deduplicate epsilon cycles.
