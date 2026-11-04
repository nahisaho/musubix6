---
feature: implementation-plan-workflow
tier: T2
approval: auto
dependsOn: implementation-plan-cli
---
# v0.2.7: Agent workflow and distribution
Goal: make specification-linked planning usable and consistent in Copilot CLI and Claude Code, from requirements through verified completion. Readers: users, agents and maintainers. Status: implementation and targeted validation observed; initial own-project task adoption observed under the earlier85db56af binding. Current-source proof belongs to `.sdd/evidence/v027-workflow-integration.json`; integrated full gate and release qualification remain separate requirements.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PLAN-FLOW-001 | When using planning-enabled SDD skills, the agent workflow shall create or update the implementation plan from the current specifications before implementation, follow dependencies, update the plan after each task's implementation and verification, and revise affected plans after specification changes. | TEST-PLAN-FLOW-001 |
| REQ-PLAN-FLOW-002 | When documenting or distributing the workflow, both READMEs and both installed hosts shall expose the same opt-in, planning stages, staleness and evidence rules, while preserving existing disabled-mode usage; source and packaged entry points shall include all required helpers and fixtures. | TEST-PLAN-FLOW-002 |
| REQ-PLAN-FLOW-003 | When describing progress or readiness, the skills shall distinguish plan consistency, task verification, full-project gate, frozen release qualification and human publication approval, retain counterexamples and observed evidence, and never describe pending/skipped/unknown checks as completed. | TEST-PLAN-FLOW-003 |
## PASS conditions and counterexamples
| REQ | PASS condition | Counterexample and expected result | TEST/command | Observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-PLAN-FLOW-001` | Both hosts instruct spec→plan→dependency-ordered implementation→verification→plan update. | Instructions omit spec-change replanning, post-task updates or completing prerequisites: fixture rejects. | TEST-PLAN-FLOW-001 | Genuine initial/native final-hash assertion Reds and restored Greens; four role omissions, dependency-order and successful-adoption mutations detected. |
| `REQ-PLAN-FLOW-002` | Source, extracted tgz and initialized Copilot/Claude assets work on Node20/22/24 with matching contracts. | Drop a planning helper, wrapper option or one host's opt-in instructions: installed control fails. | TEST-PLAN-FLOW-002; real package/host controls | UvWs8T runtime rows21/21 each Node20/22/24; its overall flag remains false because the separate Node20 selector reported2 filtered skips. Follow-up0z31Xl ran all3 Git-free cases on Node20 only, unfiltered with zero skips. Payload/host/native-identity/wrapper and archive-input mutations detected. |
| `REQ-PLAN-FLOW-003` | Documentation requires actual Red/Green, bounded restored mutations and separate release approval where applicable. | Claim plan-check success is full gate/release readiness, or claim unrun tests passed: fixture rejects. | TEST-PLAN-FLOW-003 | Native assertion Reds/Greens; stage/skipped/command/state mutations detected; Japanese prose and invariant pass, independent bilingual review CLEAN. |
Risk stages: contract=workflow instructions; inputs=current specs/plan; execution=agent adherence plus executable controls; verdict=distinct completion levels; history=observed evidence only; integration=source/hosts/npm/docs. No stage is waived.
Oracle: the agreed nine interview decisions, preceding three planning specs and independent source/package/host fixtures. Text checks alone do not prove an agent will obey.
## Design
Update lean-sdd-tdd, lean-agentic-coding, sdd-spec-interview and sdd-reverse-spec only where their workflow owns a planning step; use shared CLI rules rather than duplicated status logic.
Pin actual `plan check`, `plan verify TASK`, read-only state, scoped/full gates and stale-update sequences through source/wrapper/extracted-package/both-host controls on Node20/22/24. README examples become runnable only after implementation; no credentials, publication, global configuration change or implicit installation is authorized. Version preparation for0.2.7 remains separate from release qualification and publication.
Workflow ownership: lean-sdd-tdd owns the enabled-mode sequence and complete task-field contract. lean-agentic-coding delegates to that sequence rather than introducing a second spec or evidence format. The interview skill authors/updates JSON only after current requirements exist, before handing implementation off; the reverse-spec skill does so after observed behavior is characterized, without changing behavior or bypassing approval. Large-work Markdown planning remains only for disabled mode. No tool automatically decomposes natural-language requirements or edits authored statuses.
Enabled execution sequence: read current approved specifications and define PASS/counterexamples; author/update the complete JSON feature/task graph and configured scope; run read-only consistency; implement ready tasks in dependency order with real native Red/Green; run explicit task verification; adopt only the returned current successful receipt and update progress. After a specification change, update whole-file bindings and all affected/transitive dependency input fingerprints, then execute fresh verification in dependency order. A definition hash or a status claim is not a dependency input fingerprint or completion evidence. Own aggregate gates cannot verify tasks; failure history is never pruned.
Both READMEs add an explicitly candidate-versioned planning section with identical config/commands, complete field names and state/exit/stage semantics; existing disabled-mode setup remains unchanged. Prerequisites identify agent-authored current JSON and real feature/task IDs before example commands. Enabling or narrowing configured scope is a visible trusted policy change; JSON alone cannot reduce required work. Verification is bound to the current tool/runtime/commands and must be repeated after relevant installation changes. Busy locks require owner-confirmed exact-path recovery; no automatic stealing or cleanup. Single-writer local evidence is not hostile-host attestation.
Regression001 checks the four roles' operational instructions and dependency/spec-change/post-verification obligations in source and actual both-host installations. Regression002 creates a real npm tarball with `--ignore-scripts`, `--offline`, private cache and pack destination, without network/install calls. Derive role/script inventory from actual npm JSON file entries and repository `git ls-files`, compare extracted bytes/modes, and byte-compare both installed role trees with the tarball. Resolve the shipped planning/context/diagnostics helper specifiers inside the extracted tree; actual receipts must bind native execution to the selected extracted/installed script, never source fallback. Run all extracted/init controls from outside source with private HOME/user config; remove exact temporary directories afterward. Each fresh source/wrapper/extracted-source/extracted-wrapper/both-host project establishes actual assertion Red/Green, pins disabled legacy output despite ignored malformed JSON, checks pending consistency0/gate2, verifies/adopts a receipt, accepts a valid full fixture gate0/no-run2, rejects a whole-spec edit1 while context remains readable, and rebinds plus freshly verifies to recover without pruning history. Invocation-specific fingerprints are not compared as portable across installations. External runtime manifests must record actual `process.version` and tarball SHA256, not infer versions from20/22/24 labels; repetitions are actual executions, not conditional test skips.
Source-inventory input shapes: a checkout with present `.git` uses `git ls-files`; Git errors must fail, never silently select another inventory. Frozen/materialized source and extracted packages intentionally lack Git metadata, so explicitly traverse their regular in-tree role files instead. The real extracted Git-free inventory must match the independent checkout inventory; a present invalid `.git` has a refusal control. Source/package authenticity still belongs to frozen source/artifact digests, not an untrusted filesystem listing. Execute the complete package regression from a Git-free materialized source as an integration control.
Regression003 checks the five distinct evidence/readiness levels, explicit counterexample/Red/Green/restored-mutation and unknown/skipped limitations in the operational instructions and bilingual documentation. Regression001 requires adoption of the returned current successful receipt and authored status update, not merely a substring also present in "failed receipts". These are normative instruction regressions, not proof that an arbitrary agent will obey. Do not invent CODE ownership or weaken the REQs to hide documentation-only trace warnings. Actual executable controls and separate final-project/release checks remain required.
Early feasibility artifact `v027-workflow-feasibility-iZErUP/report.json` records111 actual Linux source/wrapper/both-installed-host calls across Node20/22/24, including native assertion Red/Green, explicit implementation-task adoption, valid full fixture gates and no-run2. Fresh per-entry projects preserve installation-specific command bindings. Extracted-tarball controls, documentation regressions, final full-project gate and qualification remain unrun at design time.
## Assumptions / risks
No GitHub Issue sync, multiwriter coordination or CLI-generated natural-language task decomposition. Existing feature-specific human approvals and exact-artifact publication approval remain required.
Behavioral acceptance requires TEST-PLAN-FLOW-001/003 plus real installed-host controls for TEST-PLAN-FLOW-002; keyword checks alone are insufficient. Agent obedience and prose quality have limits distinct from CLI enforcement.
## Observed implementation evidence
Paths below are external session28b37d8f-56f4-4e28-b9c8-71cc59366d60 `files/` artifacts, not distributed completion evidence. Initial genuine assertion Reds preceded production documentation edits (`v027-workflow-native-red.log`), followed by actual Greens. The strengthened final test SHA256 is `79328da3e0efe62f3c76337086e7455cf20ea912eba2e4f7752b58ba70816864`. Its post-fix bounded instruction/marker reversals produced actual assertion Reds in `v027-workflow-final-oracle-{red,shared-red}.log`, then exact production-byte restoration and all3 Greens in `v027-workflow-final-oracle-green.log`. The first --retest attempt refused001/003 because their own test bodies were unchanged; these refusals are not Red evidence. Rerunning those actual failing assertions without that inappropriate flag succeeded. Initial before-implementation Reds and later mutation Reds are not conflated.
`v027-workflow-validation-UvWs8T/report.json` records actual Node20.20.2,22.23.3,24.22.1, each21pass/0fail/0skip/0cancel/0TODO: model4/state4/CLI5/existing-context5/workflow3. Every runtime's actual npm tarball hash is retained; new workflow-file ESLint9 diagnostics PASS. This report's overall flag remains false: its separate Node20 archive selector ran002 successfully but reported two filtered tests as skipped, violating the external parser's expected counts. `v027-workflow-archive-validation-0z31Xl/report.json` binds that unchanged report/source manifest and actually executes all3 Git-free Node20 cases with3pass and zero skipped/failed tests; combined checks pass. No old failed report is relabelled PASS.
`v027-workflow-mutations-eocqo5/report.json` records17/17 isolated assertion detections, exact restoration, one actually selected restored test per mutation and three-test zero-skip baseline/final controls. It covers each role's spec-change obligation, dependency ordering, successful receipt adoption, disabled Markdown compatibility, separate full gate, skipped-evidence wording, bilingual command/state parity, missing packaged helper, Claude role drift, exact native script identity, wrapper no-run, valid archive inventory and invalid-present-Git refusal. The last two mutate fixture-input interpretation, not production CLI logic. Snapshots were removed after source/snapshot-restoration checks; source hashes and logs remain.
Two in-scope S2 findings blocked completion and were fixed: FLOW-ADOPTION-ORACLE (first violated stage=verdict) survived the earlier token-only14/15 run in `v027-workflow-mutations-AzSwgi/report.json`; FLOW-ARCHIVE-INPUT (first violated stage=trusted inputs) failed the Git-free source shape in `v027-workflow-archive-control-8Vd3AU/`. The latter was a fixture-input failure, not a feature Red. Explicit absent-Git traversal, independent checkout/archive comparison and present-invalid-Git refusal fix the input distinction without weakening the original Git-backed coverage.
Japanese optimization full mode ran GiNZA prose/reading-load diagnostics100→100 with no findings, outline and25-term extraction, and contextual continuous review of the new section. No optional rewriting was needed; immutable full README-ja equality/protected-invariant gate passed. `v027-workflow-prose-cquYaI/` retains originals, outputs and decisions. Both whole-README structural lints have exactly16 pre-existing flags each and no new flags, verified against HEAD snapshots; no clean-whole-document claim. Independent Sonnet5.5 role, bilingual-document, model-wording and distribution reviews reported CLEAN with actual read scopes and no execution/log-audit claim. Exact-phrase tests remain normative regressions, not proof of agent obedience.
At the preceding historical checkpoint, no Windows/macOS check, own-project adopted receipt/full planning gate, integrated full-project gate, frozen two-run qualification, merge or publication was claimed. Project planning policy remains unchanged/disabled; current completion requires current binding/evidence adoption, not that checkpoint's authored status.

## Git refusal oracle portability follow-up

Checkpoint CI `41730888446` on `d7659a1` failed FLOW002 on all three supported
Node versions: newer Git reports `fatal: gitfile does not point to a valid repository`
where the local Git reports `fatal: not a git repository`. Git correctly refused
the invalid present metadata; the oracle incorrectly required one diagnostic.
The first violated stage is verdict, not source authenticity or production
inventory selection. Retain the failed CI and all prior reports with zero new
qualification credit.

| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-PLAN-FLOW-002` | Both observed fatal diagnostics satisfy the exact owned assertion for Git exit128 versus expected0; valid checkout/archive inventories still pass, and invalid present metadata still fails without fallback. | A text-only `/not a git repository/` oracle rejects the newer fatal diagnostic; an unrelated exit2 with the old words must not borrow the fatal refusal control. | TEST-PLAN-FLOW-002; native assertion Red/Green; isolated text-only, unbound-exit and silent-fallback mutations with restored valid controls | Native regression assertion Red preceded the shared predicate fix; Green and unaffected001/003 Refactors passed. Actual nb50t1 matrix21/21 each Node20/22/24, unfiltered Git-free3/3 and isolated JS diagnostics pass. Actual3fgIeQ mutations19/19 detected/restored with valid controls. No hosted fixed-head or fullgate/qualification pass is claimed. |

Keep the structured refusal predicate outside the annotated regression body
so the genuine failing regression remains byte-identical across its fix.
Bind it to the owned `AssertionError` with actual128/expected0, not localized
stderr wording. The existing actual invalid-Git call and valid Git-free
archive/source/package controls remain required. Contract, trusted inputs,
execution, history and integration checks are unchanged and still apply;
none is waived by making diagnostic wording portable.

Actual external session artifacts: `v027-git-oracle-{direct-red,native-red,native-green,native-refactors}.log`,
`v027-workflow-validation-nb50t1/report.json` and
`v027-workflow-mutations-3fgIeQ/report.json`. Both the diagnostic-restricted
predicate and the unbound nonzero-exit predicate were assertion-detected,
in addition to all17 retained workflow mechanisms. Mutation coverage is bounded
to these19 cases on Linux/Node24; the runtime matrix uses actual Node20.20.2,
22.23.3 and24.22.1. Independent reviewers read only the contract/regression delta,
not executed logs, and correctly retained the limit that any Git exit128 matches
the refusal shape. The preceding valid checkout inventory and actual invalid
gitfile fixture supply cause/context; this is not a general Git diagnostic parser.

## Own-project optional execution protocol

The repository's committed planning policy remains disabled. Self-adoption is
an additional, explicit temporary opt-in at this development root: preserve
the exact original `.sdd/config.json`, add only `planning.required:true` and
the four existing planning features as the planning scope, and leave all
native runners, required project checks, timeouts and legacy requirements
unchanged. This is not a permanent policy flip or a release-scope reduction.

Update all current whole-spec bindings, rebind dependencies to their actual
current task-input fingerprints in prerequisite order, verify each real task
and adopt only its current successful receipt before authoring completion.
Retain receipts, logs and failure history. An authored status or definition
hash never substitutes for verification. Run enabled consistency with every
task effectively completed, restore the exact original disabled configuration
in a guarded `finally`, and check disabled compatibility. Re-enabling the
identical temporary scope and rechecking completion before restoring it again
is a valid control for the retained development-root evidence.

Receipts remain bound to this root and selected native tool/runtime; they are
not portable qualification evidence. Other checkouts/installed tools must
reverify when opting in. The final full native gate runs against the original
committed project policy and all existing checks, not a narrowed substitute.
Temporary enabled consistency/task verification is not an enabled full-project
gate or release readiness. Frozen qualification and publication approval remain
separate. If source/configuration changes invalidate a receipt, rebind and
verify again rather than silently accepting it.
Guarded restoration does not survive SIGKILL or a lost session. Explicitly
compare `.sdd/config.json` with the original committed bytes before the final
native gate and again before commit; a mismatch must stop rather than silently
overwrite another writer.

Initial actual self-adoption `v027-self-adoption-lrY8oe/report.json` verified
and explicitly adopted all15 real task receipts under specification85db56af.
Enabled and identical-reenabled controls each reported15complete; the exact
original disabled configuration was restored and both disabled controls passed.
The first attempt `v027-self-adoption-U06kEb/` retained a real first-task PASS
receipt, then the development driver authored unsupported `completed` instead
of `complete`; the model correctly rejected that input and original config was
restored. This setup failure is not feature Red or qualification credit.

This evidence amendment changes the workflow whole-spec binding. Rebind and
freshly verify affected tasks in dependency order; retain already-current
receipts only after an actual current-input consistency check. Record the
initial and final reports/current receipt hashes in the source-bound
`.sdd/evidence/v027-workflow-integration.json`. An absent/stale report cannot
establish current completion. No original-policy full native gate, same-head CI
success, portable receipt, frozen qualifying run, merge or publication follows
from self-adoption.
