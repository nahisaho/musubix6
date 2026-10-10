S1|high|.sdd/specs/hm.md:15|Closed: environment-free generalization; mutation excluded
S2|med|.sdd/specs/flow.md:18|Closed: predicate and type shadowing checked
S3|med|.sdd/specs/checker.md:13|Closed: every reachable return and fallthrough checked
R1|high|src/pycheck/hm.py:48|Closed: TEST-HM-009 reverses callable parameter constraints
R2|med|src/pycheck/checker.py:113|Closed: TEST-CHECKER-010 merges continuing declarations
R3|med|src/pycheck/checker.py:55|Closed: TEST-CHECKER-011 validates nested guards
R4|med|src/pycheck/hm.py:159|Closed: TEST-HM-010 uses uniform sort keys and parseable labels
R5|med|src/pycheck/contracts.py:47|Closed: TEST-CONTRACTS-009 validates substituted mutable types
R6|med|src/pycheck/contracts.py:47|Closed: TEST-CONTRACTS-010 matches union remainder
A1|med|tests/test_contracts.py:47|Closed: generic invariance tested in both argument orders
D1|med|src/pycheck/contracts.py:65|Closed: substituted unions use whole-type assignability; both argument orders tested
ROUND1-CORRECTNESS|info|src/pycheck/hm.py:39|Closed: independent fix-delta review clean
ROUND1-CONTRACT|info|src/pycheck/contracts.py:53|Closed: independent D1 fix-delta review clean
ROUND2|info|src/pycheck/checker.py:34|Closed: combined final fix-delta review clean
