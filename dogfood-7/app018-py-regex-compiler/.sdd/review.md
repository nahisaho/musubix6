# Independent T2 risk review
| id | sev | path:line | state |
| --- | --- | --- | --- |
| R1 | med | .sdd/specs/automata.md:12 ordered semantics clarified | Fixed |
| R2 | high | .sdd/specs/safety.md:25 compilation allocation cap added | Fixed |
| R3 | high | regexc/vm.py:67 empty iteration commits path before progress guard | Fixed |
| R4 | high | regexc/vm.py:56 explicit sequence/repetition stacks | Fixed |
| R5 | med | regexc/vm.py:86 progress guard restricted to unbounded repeat | Fixed |

Reviewers: regex-contract-review, regex-state-review, regex-budget-review.
Axes: contract, correctness/state, resource boundaries/test adequacy.
Delta review: regex-delta-review found R5; its fix passed the full gate.
Clean round 1: regex-clean-round-one found no high-confidence delta defects.
Clean round 2: regex-clean-round-two found no delta defects; 3960 additional differential operations matched Python re.
Final evidence: 29 pytest tests; 5607 persistent differential-oracle operations; no Open findings.
