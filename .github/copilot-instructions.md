# Repository instructions

## Counterexample-first development (T1/T2)

- Use GPT-6.1 Sol for development. Before implementation, define the conditions required for PASS and construct counterexamples that violate them; do not use the model only to write fixes.
- Record this in the existing feature contract/spec, not a second document: `REQ | PASS condition | counterexample | TEST/command | observed evidence`. Give concrete inputs and expected results, not just "the gate passes".
- Check six failure stages: contract, trusted inputs, execution, verdict, evidence history, integration/distribution. Classify each risk by the first condition it violates. Record a reason for stages that do not apply.
- For each changed requirement, implement a failing regression first and confirm the expected assertion failure before changing production code. Include a valid-input control and relevant boundary/error cases. Setup failures and skipped tests are not Red evidence.
- For each distinct failure mechanism, apply a bounded, isolated mutation after the fix and confirm that the regression detects it. Restore the mutation and rerun affected checks. For gate changes, verify both rejection of invalid evidence and acceptance of valid evidence; rejecting everything is not a fix.
- Derive expected results from the contract or an independent reference, not from the implementation under test. Enumerate all finite policy/state-table rows; use bounded generated/differential tests where enumeration is impractical, and report their limits.
- Record what actually ran and what remains unknown. Missing, skipped or unparseable evidence cannot justify a completion claim. These are agent workflow obligations, not assertions that `sdd.mjs` mechanically enforces test quality or mutation coverage.

## AI cost log (USD)

- AI cost for this project is recorded in USD in `.sdd/cost-log.md`
  (generated from AIU, cumulative across sessions; the file is committed).
- At the start of work, read `.sdd/cost-log.md` to see the cumulative cost.
- After finishing a task (and before committing), run `python3 scripts/cost-log.py`
  and include the updated `.sdd/cost-log.md` in the commit.
- Never edit `.sdd/cost-log.md` by hand.
