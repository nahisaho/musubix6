# Stable 0.2.5 qualification delta findings

| ID | Severity | Evidence | State |
| --- | --- | --- | --- |
| V025-NAMES | S2 | Native revision 9 preflight: one renamed Rust case and four resolved historical TODO names were absent. | Resolved in human-approved revision 10; explicit committed lineage, mandatory active replacements, genuine regression Reds/Greens and native controls. |
| V025-RECHECK | S2 | Independent lineage design review: freeze-only negatives did not establish frozen-recheck enforcement. | Resolved; all eight registered/required/excluded states per five replacement names tested at freeze and structurally rehashed recheck. |
| V025-PROVENANCE | S2 | Independent lineage design review: clarify whether old names belong to the target commit. | Resolved; old names come from the SHA-bound inherited manifest, target names/bytes from independently verified committed content references. |
| V025-INTERRUPTED | S2 | Interrupted revision 9 gate left an untracked test work root; revision 10 trace failed on its duplicate/unknown annotations. | Resolved; exact generated work root quarantined externally, failed report retained, unchanged-source full gate rerun PASS. |

Review model: Claude Sonnet 5.5. Data and implementation reviews were bounded and
did not independently execute tests. The final lineage implementation review
inspected production resolver/call sites, not the test/spec bodies. The agent's
retained execution, inventory and mutation evidence is separately consumed by
`.sdd/evidence/v025-development.json`; it is not expanded into reviewer claims.

The full gate retains implementation-drift, trace/stub, historical refactor and
missing quarantined-fixture check-resolution warnings. Actual project checks
completed, tracked inputs stayed fixed, and trace has zero errors. No warning
was silently removed or downgraded. Technical release readiness remains pending
two fresh complete runs of one exact frozen 24-cell manifest. This record grants
no main push, tag or npm-publication authority.
