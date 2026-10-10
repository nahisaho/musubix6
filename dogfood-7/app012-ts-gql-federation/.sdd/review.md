# Federation risk review
spec review: federation-spec-review → federation-spec-delta, corrected keys/cardinality/selection validation.
R1|high|packages/planning/src/index.ts:34|Fixed|TEST-PLAN-011 covers delayed nested prerequisites
R2|high|packages/planning/src/index.ts:40|Fixed|TEST-PLAN-010 covers B-C-B dependency stages
R3|med|packages/gateway/src/index.ts:33|Fixed|TEST-GATE-009 covers caller and adapter mutation
R4|med|packages/planning/src/index.ts:32|Fixed|TEST-PLAN-009 covers hidden key alias collisions
R5|med|packages/execution/src/index.ts:58|Fixed|TEST-EXEC-009 rejects missing keys
R6|med|packages/execution/src/index.ts:25|Fixed|TEST-EXEC-010 rejects both null and absent hidden keys with client alias collisions
Delta reviewers: federation-delta-state and federation-delta-contract confirmed R1-R5; found R6, now fixed.
Clean round 1: federation-clean-state-1 and federation-clean-contract-1 passed R6 correction.
Clean round 2: federation-clean-state-2 and federation-clean-contract-2 passed all resolved deltas.
Final: zero Open findings; strict typecheck and all 46 node:test cases pass.
