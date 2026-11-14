---
feature: release-qualification
tier: T2
approval: human
artifacts: .sdd/release-validation.v0.2.10.json, .sdd/release-content-mutations.v0.2.10.json, .sdd/specs/claude-code-support.md, README.md, README-ja.md, CLANGELOG.md
---
# Reproducible Linux-only release qualification
Goal: prepare the exact stable0.2.10 candidate from main for the human-approved20-cell Linux Node22/24 qualification, with zero transferred credit and no publication authorization. The current contract includes the Linux Node20 retirement amendment below; earlier24-cell preparation and evidence remain historical. Genuine seven-artifact human preparation approval, current native verification, two fresh unchanged complete runs and separate exact-package human publication approval remain required.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-RELQ-001 | When a current Linux-only qualification plan is admitted, the validator shall require exactly the20 cells defined by the approved Linux Node20 retirement amendment, retain their original budgets and named cases, explicitly exclude NATIVE-WSLC and the four retired Node20-only cells, bind the scope and committed historical test lineage to the approved plan, and reject missing, duplicate or weakened remaining cases and invalid lineage; historical approved revisions remain unchanged provenance. | TEST-RELQ-001, TEST-RELQ-LINEAGE-001, TEST-RELQ-LINUX-001 |
| REQ-RELQ-002 | When a current candidate is frozen, checked or prepared for its fresh required gate, the launcher shall bind source/archive/package, exact authored planning definitions, current named catalogues and approved historical replacements, helpers, dependencies, configuration and real Linux Node22/24 and native tool inputs by digest, require no Node20 executable including during registration-only discovery, establish genuine current native task verification and receipt adoption in that gate's own source root before the full gate, reject unavailable or changed inputs or missing replacements, and preserve old/failed history and revisions without transferring credit. | TEST-RELQ-002, TEST-RELQ-LINEAGE-001, TEST-RELQ-LINEAGE-002, TEST-RELQ-PLANNING-001, TEST-RELQ-DISCOVERY-001 |
| REQ-RELQ-003 | When any required cell finishes, the validator shall require its exact named cases and valid controls, including required active replacements for resolved historical TODOs, actual command/exit and retained parseable evidence; INTEGRATED-GATE shall additionally require every frozen planning task's genuine current native proof and the actual unfiltered full gate within its unchanged shared deadline, rejecting unprepared raw-gate or preparation-only claims; missing, skipped, timed-out, unknown or setup-error outcomes shall never count as a pass. | TEST-RELQ-003, TEST-RELQ-LINEAGE-002, TEST-RELQ-PLANNING-001 |
| REQ-RELQ-004 | When technical readiness is evaluated, the launcher shall require two consecutive complete clean runs of the identical frozen matrix and candidate in fresh isolated state, reset the streak on failure or relevant change, and never authorize tagging or publishing. | TEST-RELQ-004 |
| REQ-RELQ-005 | When a stable 0.2.10 qualification package is prepared, it shall retain executable, reviewable helpers and self-tests in the repository, verify the exact tgz through the actual Linux package entry point on Node22/24, preserve Windows Node20/22/24 development controls, report exact artifact paths/hashes, exclusions and residual risks separately from human release approval, and require the publishing workflow to verify the packed tgz against the approved digest before publishing that same file. | TEST-RELQ-005, TEST-HOST-005, TEST-RELQ-PUBLISH-001, TEST-RELQ-LINUX-001 |
## PASS conditions and counterexamples
Current normative exception: the Linux Node20 retirement amendment below
supersedes earlier24-cell/three-runtime assertions for revision4 only.
Those earlier rows and observations remain historical; they are not current
support promises or authority to discard failure evidence.

| REQ | PASS condition | Concrete counterexample / expected | TEST/command | Observed evidence |
| `REQ-RELQ-001` | Exactly the old 25 cells minus NATIVE-WSLC are required; NATIVE-WSLC is explicitly excluded, never reported as passed. | Delete PACKAGE-22, duplicate REGRESSION-24, shorten MUTATION's 3600-second budget, or silently count WSL as passed: reject; complete approved Linux plan: accept. | TEST-RELQ-001, complete finite cell-policy rows | Pending |
| `REQ-RELQ-002` | Repeated genuine tool probes and all frozen bytes agree; the immutable candidate and plan have stable digests. | Change one byte of tgz/helper/config or omit Node22 after freeze: fail before credit; identical inputs: accept. | TEST-RELQ-002, isolated input mutations | Pending |
| `REQ-RELQ-003` | Every required named case runs with its expected verdict; each mandatory mutant has passing baseline/restoration and an assertion-detected violation. | Missing named test, required skip, successful mutant, setup-error mutant, malformed output or unknown exit: reject; all positive controls: accept. | TEST-RELQ-003, bounded verdict mutations | Pending |
| `REQ-RELQ-003` | A frozen owned `assert.match(testJob, /npm ci/)` mutant is detected only by its native assertion at the frozen frame with the exact prefix `The input did not match the regular expression /npm ci/. Input:` followed by a newline; baseline and restoration pass. | Changing `run: npm ci` to `run: npm --version` must be detected. A diagnostic about `/npm test/`, the right text at another frame, or an exit-1 loader failure must be rejected. Freeze the expected prefix from the independent test's regex literal, never from observed mutant output. | TEST-RELQ-003; all 49 MUTATION cases; isolated diagnostic-policy sensitivity | Previous frozen run `qualification-v023-linux-r2-K3keBH/runs/run-PCpOpH/MUTATION` genuinely detected the exact owned assertion at `sdd.test.mjs:13033`, but the inherited generic diagnostic-word regex rejected its native message. Failed run retained; streak0. Implementation and qualifying reruns pending approval. |
| `REQ-RELQ-003` | Setup-error text quoted inside the message of an exact owned native assertion is data, not a loader verdict; all actual execution and native ownership checks still apply. | The `owned-assertion-type` mutant produces an owned `ERR_ASSERTION` whose message quotes `Cannot find module child` and ends `false !== true`: accept only with passing baseline/restored controls. The same text from a loader error, foreign frame, malformed event, skip, timeout or unknown exit: reject. | TEST-RELQ-003; bounded setup-text sensitivity | Zero-credit spike `qualification-legacy-reason-spike-R81d6Q` passed publish-restore with its provisional exact prefix, then exposed raw-text setup rejection of this owned assertion. No complete 49-case pass or qualification credit is claimed. |
| `REQ-RELQ-003` | The two explicitly named scanner cases require their independently specified exact TRACE header prefixes at their frozen owned assertions, with passing baseline/restored controls. | `scanner-complete-sources`: cutting both padded annotated sources yields `TRACE FAIL: 1 REQ, 0 annotated entities, 1 errors, 2 warnings` plus newline. `scanner-limit-validation`: ignoring invalid configuration yields `TRACE OK: 1 REQ, 2 annotated entities, 0 errors, 0 warnings` plus newline. A different count/header, another case or frame, or missing restoration must reject. | TEST-RELQ-003; targeted diagnostic regression; bounded prefix sensitivity | Split zero-credit prototypes reached all 49 inherited cases and exposed these two false rejections. Expected counts follow the independent TEST-SCAN fixtures/trace policy, not mutant output. Neither a complete current-adapter cell nor two clean qualification runs has passed. |
| `REQ-RELQ-004` | Same candidate A and manifest M, fresh run1 PASS then fresh run2 PASS => technical-ready only. | PASS then FAIL then PASS => streak1; A/M changes or reused run state => no ready; exclusion alone is never PASS. | TEST-RELQ-004, every streak-transition row | Pending |
| `REQ-RELQ-005` | Stable0.2.8 archive installs offline and copied host assets/CLI work on Node20/22/24; all release paths/hashes are retained. | A0.2.7 or0.2.8-dev.0 archive, stale packed CLI, absent helper or publication-authorized development report: reject; exact stable0.2.8 package: accept. | TEST-RELQ-005, TEST-HOST-005, actual package cells | `.sdd/evidence/v028-preparation.json` retains genuine host-version assertion Red/Green, three-runtime actual npm installation/entry-point/both-host controls and ten restored version/distribution mutations. The complete1187-test attempt failed13 with0skips; the missed legacy opt-out is fixed with an isolated assertion reversal, but12 release controls remain stale. Current release-adapter Red/Green, task verification, full gate and frozen qualification remain pending. |
| `REQ-RELQ-003` | Legacy generated-regex and scanner-prefix rules apply only to the 49 legacy MUTATION cases. All 57 DIAGNOSTIC-MUTATION cases retain exact named selection, owned native ERR_ASSERTION, baseline/restoration, receipt and source-restoration requirements, without an invented message prefix. | The cumulative-bytes diagnostic mutant produces native `The "string" argument must be of type string. Received type object (null)` at its independently owned assertion: accept with complete controls. A loader error, foreign assertion, surviving mutant or missing control still rejects. The same argument-type message does not satisfy a legacy case's required regex prefix. | TEST-RELQ-003; diagnostic-cell boundary regression; bounded restored policy mutation | Frozen 0.2.3 run `qualification-v023-linux-r3-qvwOlK/runs/run-jNc1aX` retained 19 passing cells including INTEGRATED-GATE, then failed this over-restrictive diagnostic policy. Streak0; no credit transfers to 0.2.4. |
| `REQ-RELQ-002` | Every explicitly configured executable/helper/dependency input used by execution is contained in a frozen fingerprint; a matching complete closure passes. | Configure `/private/node_modules`, a Gradle JAR or a prose interpreter outside every frozen tree: freeze fails; bind each actual dependency tree, freeze, then change one dependency byte: check fails; restoring its exact bytes passes. | TEST-RELQ-CLOSURE-001; isolated closure sensitivity | Pending; previously confirmed missing-closure finding remains blocking. |
| `REQ-RELQ-002` | Every public frozen-input check requires the caller's exact retained manifest SHA-256 and verifies structural/policy bindings, including the complete approved matrix and command catalogue. | Omit the expected hash, supply an empty hash, or edit the manifest to zero required cells/commands and supply its new hash: reject; the unchanged genuinely frozen manifest with its original expected hash passes. | TEST-RELQ-CLOSURE-001 | Pending; previously confirmed optional-digest finding remains blocking. |
| `REQ-RELQ-004` | Public readiness checks recheck the caller-bound frozen manifest and retained hash-chained history before considering any clean-run credit. | Supply two synthetic empty PASS runs with an inline zero-cell manifest, or alter a retained command/catalogue: never technical-ready. Two complete fresh runs of a valid unchanged manifest remain accepted. | TEST-RELQ-READINESS-001; TEST-RELQ-004; isolated readiness sensitivity | Pending; no prior run credit. |
| `REQ-RELQ-003` | Process absence is established only by ESRCH or a correctly parsed Linux zombie state; permission or observation errors are explicit failures. | A signal-0 probe throws EPERM: reject instead of treating the PID as gone; `/proc/stat` contains `123 (worker ) with spaces) S ...`: parse S, not a word inside comm. ESRCH and a final state Z are accepted. | TEST-RELQ-PROCESS-001; native process controls; isolated process sensitivities | Pending. |
| `REQ-RELQ-003` | Termination is idempotent and all non-ESRCH process-group cleanup errors prevent a successful process verdict. | Two output chunks exceed the budget: schedule only one escalation; inject EPERM on group SIGTERM/SIGKILL: retain an explicit error and reject. A normal process, an already absent group and successful bounded descendant cleanup remain valid controls. | TEST-RELQ-PROCESS-001; native process controls; isolated process sensitivities | Pending. |
| `REQ-RELQ-005` | Packaged-origin content controls consume the exact future frozen tgz rather than silently repacking another archive; development-only repacking is explicitly identified and has zero qualification credit. | Supply a different tgz path/hash to a packaged-origin case: reject before any case credit; the frozen package and exact approved package inventory pass. | TEST-RELQ-PACKAGE-BINDING-001; PACKAGE and content cells | Pending; future frozen-package integration concern remains open. |
| `REQ-RELQ-003` | All13 declared skill mechanisms,1180 source vendor challenges and60 origin sensitivities (1253 total named skill cases) have passing baseline/restored controls and exact owned assertion detections; valid names, questions, obligations and matching reviews remain accepted. | Disable duplicate detection: the fixed duplicated-particle input must assertion-fail; change one of118 reference file bytes or XOR any one permission bit: the exact inventory assertion must fail, including source-init/package/package-init representatives. Unchanged inventories and exact restoration must pass. | TEST-RELQ-SKILL-001; SKILL-MUTATION | The current independent118-file source/archive/npm/both-host inventory spike passed as recorded below. Current catalogue/native verdict controls and complete skill-cell execution await preparation approval; no qualification credit. |
| `REQ-RELQ-003` | All 14 placeholder mechanisms are assertion-detected; source, source-init, extracted-package and package-init obey the fixed 2184 marker and 994 context rows, exit/status and JSON policy. | `todo : pending` => one placeholder, `TODO-cli` => zero, nonempty annotation => zero; findings exit 0, missing input exits 1 with empty stdout and explicit stderr. Accepting any assertion or suppressing all findings must fail the validator regression. | TEST-RELQ-PH-001; PLACEHOLDER-MUTATION | Independent existing golden policy read; replacement execution pending. |
## Design
Revision4 uses the explicit Linux Node22/24 policy and frozen discovery helpers below.
Earlier designs and failures remain historical evidence with no transferred credit.

### Linux Node20 retirement, approved scope decision 2026-11-13

The user explicitly ended Linux Node20 support, including internal tooling,
and approved20 required cells with MUTATION moved to Node22. Windows
Node20/22/24 development support is unchanged. This is a support-policy
change, not a repair or passing rerun of the failed Node20 lexical regression.
The failed CI run43381351028 and frozen run-yCeDHE remain retained failures.

Revision4 excludes exactly PACKAGE-20, WATCHDOG-20, NO-CHANGE-20 and
REGRESSION-20, in addition to the existing NATIVE-WSLC exclusion. MUTATION
keeps every inherited case, diagnostic rule, owned assertion, baseline and
restoration requirement and its3600-second budget, but uses Node22.
Every other retained cell tuple and budget is unchanged. Historical scope
revisions1/2/3 are not rewritten or treated as current qualification.

Use the configured Node22 executable for preparation/discovery and require
exactly Node22/24 for current Linux execution and package receipts.
No current Linux launcher, configuration, executable PATH dependency or
discovery helper may require Node20. Historical fixtures and version strings
may retain20 where they do not execute or provision Linux Node20.
Keep the cross-platform npm engine floor unchanged because Windows Node20
remains supported; document the platform-specific policy explicitly.

Registration-only discovery on Node22/24 must disclose actual dynamic
top-level test names without running their bodies or execution hooks.
A reviewed, frozen preload may intercept node:test registration and register
each name as an explicit native skip, with no test callback execution.
Support explicitly named flat test/it registrations, their only/skip/todo
forms and before/after/beforeEach/afterEach registration. Discard execution
hook callbacks as well as test callbacks. Do not wildcard-re-export the
native API: suite/describe and mock invocation/property use, including
namespace/default-function forms, must fail closed rather than execute.
Current catalogue completeness must be measured on the entire root suite,
not inferred from the seven-name prototype. Internal discovery requires
the module.registerHooks capability (Node22.15+ or24), checked explicitly
before discovery with an actionable diagnostic; this does not increase the
separate Windows or Linux package-execution engine floor.
Its receipts must identify discovery-only operation and zero qualification
credit. Required execution must never load that preload, accept discovery
skips as passes, or replace its actual unfiltered native suite with this
catalogue. Unsupported registration forms, absent helpers, empty/duplicate
names, executed bodies, malformed events and incomplete summaries reject.
The preload and proxy are frozen helper inputs, not runtime fallback bytes.
No execution command or injected Node environment may inherit the preload.
An isolated prototype disclosed all seven independently known kotonoha
names on real Node22.23.3 and24.22.1, with0passes/7filtered registrations;
it is a spike only, not production implementation or release evidence.

| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-RELQ-001`, `REQ-RELQ-005` | Revision4 has exactly20 required cells, four explicit retired-runtime exclusions plus WSL, MUTATION on22 with3600 seconds; Linux CI22/24 and Windows CI20/22/24 | Restore REGRESSION-20, remove PACKAGE-22, omit a retired exclusion, change MUTATION cases/budget or silently remove Windows20: reject; exact approved matrix accepts | TEST-RELQ-LINUX-001; enumerate every retained/excluded tuple and runtime-policy row | Genuine corrected native Red316ms/Green989ms preceded canonical renewal; initial368ms fixture-induced refusal is INVALID Red and retained. Current-input renewal remains required |
| `REQ-RELQ-002`, `REQ-RELQ-003` | Configured22/24 disclose all independently specified dynamic names; bodies and execution hooks leave no sentinel; native discovery has0passes and exact filtered rows; real execution still runs and detects a failing body | Use legacy Node20 discovery, omit preload, execute a callback, drop/duplicate a name, hide a malformed event or credit a discovery skip as a required pass: reject; valid registration and normal execution controls accept | TEST-RELQ-DISCOVERY-001; actual supported-runtime discovery; isolated loader/receipt mutations | Nine-name native regression passed, including uninstrumented passing/failing bodies; actual22/24 each disclosed1229 independent retained/new names. Ten isolated loader/hook/skip/name/suite/environment/package/CI mutations detected assertions and passed exact restoration; no qualification credit |
| `REQ-RELQ-002`, `REQ-RELQ-005` | Package receipts contain exactly22/24 and invalid runtime sets reject before any provisioning; discovery requires an explicit uninjected environment | Provision20 and reject only its later receipt, accept an extra20 receipt, omit22, duplicate22 or inherit an unspecified Node environment: reject; complete22/24 controls accept | TEST-RELQ-005; TEST-RELQ-DISCOVERY-001; isolated preprovision/receipt/environment mutations | Genuine native Red/Green and bounded restored mutations passed; actual frozen package cells remain pending |
| `REQ-RELQ-002`, `REQ-RELQ-004` | New candidate, exact reviewed seven-artifact approval and new frozen manifest/history start at0/2; all20 required cells pass twice unchanged | Reuse the129-task development proof, Node22/24 CI,16 partial old cells, prior24-cell manifest or support decision as qualification/publication approval: reject | Native approval/freeze/check/run/status; TEST-RELQ-004 | Historical129-task proof retained; earlier genuine preparation approval does not cover this canonical renewal. Current full gate, frozen runs and publication authorization remain absent |

First violated stages: contract = exact human-approved platform/runtime
scope, not an implicit global engine-floor increase; trusted inputs =22/24
and frozen registration helpers with no20 executable; execution = actual
dynamic registration without callbacks, followed separately by genuine
unfiltered tests and all mutation controls; verdict = exact matrix and
receipt validation accepting valid controls and rejecting invalid rows;
evidence history = preserve old failures and reset0/2 on all relevant
changes; integration/distribution = both READMEs, CI, package receipts,
new exact candidate and two fixed runs agree. No stage is inapplicable.
Bounded isolated mutations must detect each changed mechanism and restore
exact bytes before current checks rerun. Missing or skipped required
execution remains blocking. Final tag/npm approval is still separate.

### Canonical renewal for the retained current CI regression

The existing canonical SDK CI case must test the actual supported Linux
matrix22/24. It retains every permission, native prerequisite, unfiltered
suite and failure-log assertion; only its matrix expectation, explicit
TEST-CI-FIXTURE-004 annotation and title changed. Content revision4 binds
that new canonical suite, not a comment preserving20 or a silently excluded
case. Historical content revisions1/2/3 remain admissible at their original
118/120/121-file cardinalities; revision4 also requires exactly121 files.
Unknown revision5, string revisions, missing/substituted paths, changed
source/package full modes or any weakened case count must reject.

The reviewed preparation commit
`0a2f8ce2ca8ffca8b668534cb312b4c3a91e893b` identifies skill tree
`64a87785985d4263ac03999c1cf5601ca233ba03` and suite SHA256
`b5ce39bb06f52850159ddb7791c22073651f83ae2475263f2cd1466f3ed1fc25`.
Independent report `linux-supported-reference-ER9jlm/report.json`, SHA256
`14a110a299c2cbf512827386d17fb0ae1dcefca57b3278d95bc655deaf34cd15`,
matches all121 Git blobs, full-mode Git archive, both actual offline
Node22/24 npm packages and eight source/package/both-host initialization
controls. Both development packages have SHA256
`5bce80cd5b4aeca8bbdf88b75d678bb749000541e33e7fc0612b2fc6434d4cfc`;
neither is a publication-approved final candidate.
Every measured skill tree has exactly the expected file and directory
sets, with no symlink or nonregular substitution. The first comparator's
expected-file-only review observation is resolved: six independent extra
file/empty-directory, missing-file, file/directory-symlink and FIFO controls
each assertion-failed for its intended reason and accepted exact restoration.
The earlier measurements remain retained; none supplies qualification credit.

Only the SDK test byte reference and its existing owned-oracle identity
change. Every canonical path, full mode, semantic/placeholder mechanism,
case ID and origin policy remains:121 files,28 semantic mechanisms,
1210 source challenges,60 origin sensitivities,1298 skill cases and14
placeholder cases. The scope and vendor reference identify the same
committed source/suite. A sixth explicit historical mapping replaces
`r35b #364 CI qualifies Node 20/22/24 without publication and retains failure evidence`
with
`r35b #364 TEST-CI-FIXTURE-004 CI qualifies Linux Node22/24 without publication and retains failure evidence`.
The original mandatory source name exists in the inherited1130-name
catalogue; omission of the replacement from actual or required catalogues
must reject. Preserve the prior content3/scope4 preparation and approvals
in the committed snapshot/ledger. This revised scope4 is not an executed
frozen manifest and carries no transferred credit.

| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-RELQ-003`, `REQ-RELQ-005` | Current content4 accepts the same exact1298 skill and14 placeholder case IDs as the committed content3 predecessor; historical revisions retain original counts | Reject content4 despite121 correct files, accept unknown5/string4, replace the ledger path at unchanged cardinality, reduce a count or omit one of nine permission bits | TEST-RELQ-SKILL-001; isolated revision-admission reversal | Independent121-file/eight-host-control inventory passed; native revised-test Red/Green and revision sensitivity await genuine renewed human approval |
| `REQ-RELQ-001`, `REQ-RELQ-002` | Genuine new seven-artifact approval admits the unchanged20-cell policy with exact new source/suite hashes and all six mappings | Reuse the earliera2d864/4cea55/fe50d0 approval, change a bound byte, retain the old CI name without replacement or omit the required new name: reject | Native approve prepare/record; TEST-RELQ-LINUX-001; lineage controls and actual freeze | Proposed content4/scope4 renewal only; no new approval, full gate, same-head CI or qualifying run is claimed |

First violated stages for this renewal: contract = explicit new human lock;
trusted inputs = independently committed121-file/full-mode identities;
execution = genuine revised-test assertion Red, valid controls and restored
mutations, then the unchanged complete matrix; verdict = accept valid4 and
reject malformed/unknown inputs; history = retain the invalid first fixture
attempt, corrected native evidence, predecessors and0/2 streak; integration/
distribution = real source/offline package/both-host controls, current full
gate/CI and separate exact-final-package publication approval. No stage is
inapplicable and the successful inventory cannot waive remaining execution.

### Current mutation ownership after the approved CI rename

The affected-suite exploratory attempt passed55/60 with no skips. Four
qualification-only oracle tests were invoked without their required frozen
context/external work root and failed setup; none is execution proof.
The remaining scanner regression exposed execution-stage S2
RELQ-CI-MUTATION-LINEAGE: the inherited ci-matrix case still identifies the
old CI title and an edit whose20/22/24 baseline no longer exists.
Keep that failed attempt and block readiness until genuine repair evidence.

Do not rewrite the inherited49-case mutation catalogue. For current scope4,
resolve a mutation owner only through the already approved same-suite,
single-target rename mapping. Preserve case IDs, all other target names,
files, edits, expected assertions, diagnostic ownership, case count and budgets.
The one explicitly declared currentMutationPolicy edit override is ci-matrix:
its from row must exactly match the inherited single-file/single-occurrence
edit; its to row reverses only those two matrix literals with the same file
and count1. Thus the current22/24 baseline must pass, the reintroduced
unsupported20/22/24 matrix must fail its exact native owned assertion, and
restored22/24 must pass. This is the same exact-matrix mechanism, not a
removed case or acceptance of an old-valid matrix under the new contract.

Unknown/duplicate override IDs, unknown fields, absent current policy,
foreign from rows, changed files/counts, non-reversed edits, missing rename
correspondence or non-singleton/non-rename owners must reject explicitly.
Historical scope1/2/3 source fixtures retain their original target/edit
semantics; current target binding must not alter or weaken scanner-message
overrides or derive an accepted assertion from mutant output.

| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-RELQ-003` | All49 retained cases bind independently owned current assertions; ci-matrix alone uses the approved new title and exact reversed old literal edit; other48 cases retain their edits and owners | Old title/anchor fails to bind; dropping ci-matrix, accepting unchanged22/24 as its mutant, allowing an unknown override or changing a count/file must reject | TEST-RELQ-SCANNER-001; actual one-case CI baseline/mutant/restored adapter; isolated rename/edit-policy sensitivities | Original whole-module scanner assertion failed on the old title. Revised test and formal Red/Green await renewed exact seven-artifact approval; production repair is not yet implemented |
| `REQ-RELQ-001`, `REQ-RELQ-004` | New scope/spec preparation hashes are genuinely approved while content4 identity,20 cells,49 mutation IDs and all budgets remain unchanged | Reuse the earlier11e3cb/734aab lock for changed scope bytes, credit the failed module attempt or standalone oracle setup failures, or advance the0/2 streak: reject | Native approval; whole task proof/full gate; fixed qualification | Earlier approved unit is preserved in commit8e3d0762e0933ef57a6c8c490f87010f9b767f98; no new lock or qualification credit |

First violated stages: contract = explicit bounded owner/edit correspondence
and new exact human lock; trusted inputs = immutable49 inherited rows and
approved scope mapping/override; execution = real current CI assertion
baseline, unsupported20 mutant and exact restoration; verdict = unchanged
owned-frame/native diagnostic rule plus valid and malformed-policy controls;
evidence history = preserve all failures/previous approvals and reset0/2;
integration/distribution = actual Node22 MUTATION and frozen oracle context,
unfiltered development gate, same-head CI and separate release approval.
No stage is inapplicable and the new S2 remains blocking until verified.

### Historical qualification design before Linux Node20 retirement
Use new versioned0.2.8 scope/content files without rewriting historical0.2.7,0.2.6,
0.2.5,0.2.4 or0.2.0 contracts or failed evidence. The new files require a genuine
seven-artifact human preparation approval; do not relock production as a unit
fixture or infer renewed authorization from the user's release request.
The approval unit is this specification plus exactly its six current
frontmatter artifacts. Historical0.2.7 and earlier files remain unchanged provenance,
not extra current approval artifacts or current execution credit.
Do not prepare or record approval until both prospective0.2.8 files exist
and their exact reviewed bytes and independent inventory are available.
The old production lock becoming stale after approved README/host/planning
changes is correct rejection, not permission to repair approval hashes.
Retain all25 inherited cells minus explicitly excluded NATIVE-WSLC:
all24 required Linux cells, budgets, exclusions, historical mappings,
13semantic/14placeholder mechanisms,60origin sensitivities and ten source
byte/mode policies for every retained/new canonical skill file.

Before finalizing the reference, independently compare committed Git blobs,
a permission-preserving Git archive and a real offline npm package against
every current canonical path/hash and origin-specific mode. Require every old
111path plus all newly shipped planning modules/tests. Set exact catalogue
counts only from this independent, reviewed inventory; no discovery result,
mutant outcome or failed comparator may silently repair an accepted reference.
The lineage commit and vendor-reference commit must identify the same source
and exact current suite bytes; older suite identities remain historical. Each REGRESSION20/22/24 catalogue must
discover every registered new planning regression; no missing-name or `TODO`
exception is introduced. Existing dynamic catalogue discovery is retained.

### Current committed-source renewal (scope3/content2)

The proposed source reference is committed
`95a890a5e7f61cb54976d0f9ffb3133be4d8f6e4`, skill tree
`11374f48ed8d9564661d9a94a9bce2433353d7d4`.
Independent `v028-release-reference-EI5ZGU/report.json`, SHA256
`7891194a3173d9f26e343e2a177b54cebee14a0543ec9c3ed28055b520335111`,
matched all118 committed blobs, archive/full permission modes, actual
offline npm bytes/modes and source/package initialization on both hosts
(Copilot118/Claude115). The developmental tgz SHA256 is
`f302dfba24fe1d56f41e91ee85564c8663e5befad76bc1d5ff2208cd017810ef`,
not an approved publication artifact.

Exactly six canonical byte digests change: the planning-workflow test,
both SDD requirements siblings, tech-writer, its requirements doctype and
the native Windows fixture. The latter explicitly opts execution-only
npm/MSVC fixtures out of planning without changing product defaults,
commands, assertions or expected native outcomes. Real Windows run
42180223149 failed on20/22/24 because those old fixtures lacked a JSON plan;
retain it as a fixture setup failure, not assertion-Red evidence.
Four current Windows/cost owner tasks passed genuine native verification;
new actual Windows CI remains required before claiming native success.
The already human-approved workflow contract digest is renewed as a
declared local delta. No canonical path, full mode, policy, inherited
mapping, assertion oracle or required case is removed or weakened.
Scope/content revisions3/2 retain the exact2/1 predecessor digests and their
committed source identity. Credit and the clean-run streak remain0.
The existing seven-artifact human approval is stale for these proposed
bytes and must be renewed explicitly before admission or qualification.

| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-RELQ-001`, `REQ-RELQ-002` | Genuine new seven-artifact approval admits the same24-cell scope and independently committed118-file reference | Old approval, old six digests, missing path/mode, mismatched lineage or weaker budget must reject; exact new approved reference must accept | Native approve prepare/admit/preflight; TEST-RELQ-001, TEST-RELQ-BASELINE-001 and TEST-RELQ-CONTENT-ADMISSION-001 | Previous actual preflight rejected the stale bytes; current committed/archive/npm/both-host inventory matches118/118. Renewed approval and current adapter controls are pending |
| `REQ-RELQ-003` | Every required runtime discovers and executes all1189 currently registered names, including the new ownership and process controls, while preserving historical replacements | A name-filtered partial run, missing new name, required skip or old catalogue cannot establish a full regression-cell PASS | Actual Node20 registration discovery; REGRESSION-20/22/24 | Current registered catalogue has1189 names; selected ownership/readiness controls passed4/4 on each real20/22/24. This is not three complete regression cells |
| `REQ-RELQ-004`, `REQ-RELQ-005` | Current native proof, original-budget fresh preparation, two unchanged complete fresh runs and separate exact-artifact human release approval establish releasability | Retained developer gate, old CI, a small two-task fixture, unknown issue385 cause, stale receipts or changed candidate/matrix never transfer qualification or release authorization | Native task verification, full gate, current CI, fixed freeze/run/status | Retained developer gate passed1189/1189 and all118 current source tasks passed consistency. Current source CI, full-scale fresh-root deadline/capacity, original385 classification and frozen runs remain required |

First violated stages remain explicit: contract = genuine renewed approval;
trusted inputs = exact committed reference and frozen tools; execution =
all required named cases and full118-task fresh native proof within the
unchanged12000 seconds; verdict = invalid evidence rejects and valid controls
accept; history = retain predecessors/failures and reset validation without
credit; integration/distribution = both hosts, current CI, two identical
complete clean runs and separate human release approval. No stage is waived.
Neither current inventory success nor approval to prepare resolves issue385
or authorizes tagging, publishing, scope narrowing or S1/S2 downgrades.

### NO-CHANGE fixture admission after frozen7f failure

The frozen candidate7f04e57, manifest SHA256
`8111fe707b8ecd131637a683a760f5a316b4c5474bfd3e93d02ec4cafcf0f09d`,
failed run-meHrgq at NO-CHANGE-20. Its retained changed-gate stdout reports
`SDD PLAN INCOMPLETE stage=gate enabled=true` and a missing
`.sdd/implementation-plan.json`; the actual inner exit is2. PACKAGE-20 and
WATCHDOG-20 passed,21cells were unrun, and the streak remains0. This setup
failure is not assertion Red evidence and is not the unidentified issue385
failure. The immutable failed manifest, run, commands and logs are retained.

The no-change fixture exercises project-check routing, not application
planning. Its valid input shall explicitly set `planning.required=false`.
The product default remains `true`; no required cell, oracle, runtime,
timeout, history rule or unknown-finding blocker is weakened.

| REQ | PASS condition | counterexample | TEST/command | observed evidence |
|---|---|---|---|---|
| `REQ-RELQ-003` | The generated execution-only fixture explicitly opts out of planning; real changed/unchanged commands pass and execute/skip the project check respectively. A fresh product init still requires planning. A changed project check exiting17 fails the gate with exit1. | The fixture omits the planning setting and has no JSON plan, causing exit2 before routing; globally disabling planning, skipping every project check, or swallowing exit17 must not pass. | TEST-RELQ-NOCHANGE-001; actual NO-CHANGE-20/22/24 adapters | Final test on unchanged production fails its own serialized-input assertion (`undefined !== false`): `v028-no-change-red-ySLhQH/report.json`, SHA256728172811654fdfd66f483d61a42584f48da6c72cb8f654acd1ee26695b4bc39. Isolated proposed-code Node20/22/24 controls all pass: `v028-no-change-spike-uR19nL/report.json`, SHA2565f49f291430e89f490bf9cd291dbc1a4b6a2f490139507301149b598c999f9af. Production Green, native ledger Red and post-fix mutation/restoration are still pending; actual subsequent results belong in `.sdd/evidence/v028-preparation.json`. |

These are targeted tests, not the full regression catalogue. Node20/22
explicitly report22other test names excluded by the selector; none is
qualification credit. The initial isolated attempt
`v028-no-change-spike-NRRuIi` failed because the draft test incorrectly
expected exit17 in the gate summary rather than in its retained check
receipt. The corrected test independently verifies receipt SHA256, actual
exit17 and absence of process/setup failure. That initial test failure is
retained, not used as regression Red or as a product defect.

The proposed helper changes only this execution fixture's planning setting
and adds its trace annotation. Its isolated complete file,
`scripts/release-qualification-cells.mjs`, has SHA256
`28ec18edf72b2387070435eb8e73673d9ff64cf13dc7b592c59f55c07b4f1337`.
The final regression file has SHA256
`57c89a75ccc598c15368e1112435d268789910de855f5ecfff90c19956e478a5`.
These prospective bytes have not yet been applied as production code.

First-violation stages: contract = execution-only routing controls must be
admissible without weakening the product default; trusted inputs = the first
observed violation is the fixture's missing explicit planning opt-out;
execution = require native changed/unchanged/error commands, not simulated
results; verdict = accept valid controls and reject actual failed checks;
evidence history = preserve the failed run and reset validation for a changed
candidate; integration/distribution = reverify affected owners, retain the
unchanged24-cell matrix, and freeze a new committed candidate. All six stages
apply. Isolated development/spike results confer zero qualification credit.
Issue385 remains open, unclassified and independently blocking.

### Historical stable0.2.8 preparation (scope2/content1)

The historical scope/content revisions are2/1. Scope revision1 at committed
`b43d9830c92092384bea0e00a8d33db4dc16e9c1`, SHA256
`2d493a6c27b15c26dbf53dad1d5bc8853cdfffa759cbbb90856baea1d80728ca`,
remains historical preparation evidence with zero qualification credit.
The unchanged explicit previous-version
references retain the exact0.2.7 revision3 files and failed history with zero
transferred credit. The committed reference is
`a22618df676d9766acc05cff6e3128882053fb74`, skill tree
`59ab6c23bd11fb185cb1f3b312154c17b30f796b`.
Independent `v028-release-reference-xfxNfy/report.json`, SHA256
`a807ffed2a5c3e5cee19315ed1c488573944ab1ccd4452e02b1e534f211fa41f`,
matched every118 retained path/full source mode against Git blobs and a
permission-preserving archive, exact normalized npm modes, and actual
source/package initialization on both hosts (Copilot118/Claude115).
This Node24 feasibility grants no qualification credit or artifact approval.
Independent review also exposed a carried historical #233 witness digest and
old opt-in descriptions. The proposal now binds the same unchanged current
#233 assertions at6173-6182/current suite SHA, retains the old witness separately
as historical evidence, and describes the approved default-enabled policy.
The executed TEST-KOTO-SYNC-003 oracle, its ownership/assertions, all mutation
anchors and finite case counts are unchanged.
Earlier independent reference `dbec328` remains historical after the one-line
legacy Markdown-plan fixture correction. No historical file is overwritten.

The118-path inventory,13semantic/1180source/60origin skill cases (1253 total),
14placeholder mechanisms,24required Linux cells, budgets and exclusions are
unchanged. Actual registered regression discovery must include the default
MODEL005/CLI007 and NODE-SUMMARY002/003/004 controls on every required runtime.
Do not replace an unknown case with a passing name-filtered run.

| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-RELQ-001`, `REQ-RELQ-002` | Genuine current seven-artifact approval admits the complete028 scope/reference; unchanged old approval never admits changed bytes | Old027 lock, mismatched lineage/reference commit, omitted file, altered mode, missing cell or shorter budget rejects; exact approved028 control accepts | TEST-RELQ-001, TEST-RELQ-CONTENT-ADMISSION-001, TEST-RELQ-BASELINE-001 and lineage controls | Committed118-file/full-mode feasibility passed; new human approval and adapter controls pending |
| `REQ-RELQ-003`, `REQ-RELQ-005` | Stable028 entry point and every unchanged required case/control execute with parseable complete evidence; malformed/old input is rejected without suppressing valid controls | Old027 target/archive/catalogue anchor,028-dev.0, missing default/output regression, setup-error mutant or skipped required case rejects; consistent028 and genuine assertion detections with restored controls accept | TEST-RELQ-005, TEST-RELQ-HOST-001, package/skill/native catalogue controls; isolated target/path/version mutations | Actual host controls passed on20/22/24; release-adapter assertion Red must precede production helper cutover after genuine approval |
| `REQ-RELQ-004` | Full native gate and two consecutive complete clean runs of one unchanged frozen028 candidate/matrix yield technical readiness only | Reusing027 passes/manual-publication exception,1174/1187 partial success, stale task receipts, unknown original in-scope S1/S2, or any relevant change resets/refuses readiness | Native gate, frozen check/run/status, current-head CI and unchanged state-table controls | Qualification streak0; original issue385 assertion remains unidentified, current task verification and full gate unfinished |

First violated stages: contract = exact stable028 and genuine seven-artifact
approval; trusted inputs = committed118-file/full-mode inventory, current
metadata/lineage and frozen tool/configuration digests; execution = every
named required case and actual package entry point in fresh state; verdict =
invalid evidence rejects and valid controls accept, with no skip/unknown or
setup failure counted as PASS; evidence history = retain all failed full and
mutation/setup attempts, current task receipts and zero inherited credit;
integration/distribution = two identical complete runs and separate exact
artifact/path/hash/residual-risk human release approval. No stage is waived.
The observability fix does not identify/classify the original issue385
assertion, close that issue, downgrade any S1/S2 or authorize a publication
exception. Only the exact prepared files may be approved; subsequent relevant
changes invalidate approval/validation as required.

### Stable0.2.8 revision2 fresh-gate proof preparation

The original-root `b43d983` full native gate and Node20/22/24 CI passed;
its actual first gate check ran1187 tests with1187pass and0skip, without retry.
Retain its warnings and the earlier prospective observations above as
revision1 history, not proof that a fresh required cell passes.
The unchanged content reference remains revision1, with all118 skill
paths/full modes,1253 skill cases,24 required cells and budgets preserved.
Only this specification and scope revision change in the seven-artifact
approval unit; no other current artifact is added or silently relocked.

| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-RELQ-002`, `REQ-RELQ-003` | A fresh gate source retains exactly the frozen authored tasks/tests/dependency keys, obtains genuine current native receipts in verified-parent order and passes current native admission before its actual full gate. SDK fingerprint and history rules remain unchanged. | Actual `materializeSource` of the complete `b43d983` plan SHA`deb6e1434985bcd13326cdc120e15d083d2aba276efd5da80a7f2dfabae204bd` into `v028-gate-clone-spike-jZQkzm/cell/source`, on the same Node24, yields104 revalidation-required and14 replan-required: old absolute script/root proof must not be admitted. After repair every expected task must genuinely verify in that root; disabling planning, omitting tasks or reusing old-root receipts rejects. | TEST-RELQ-PLANNING-001; actual native plan check/verify and full gate | Scratch classification recovery SHA`f325b008ba9f8199a3660e66cb738360fc049bb66362f3f893cce305fbe0bb86` preserves native FAIL1/raw bytes and the original over-specific driver refusal. It reruns no tests and is not a formal assertion Red. |
| `REQ-RELQ-002`, `REQ-RELQ-003` | Only author-owned existing dependency fingerprint values and current receipt/status pointers may change; the independent validator re-derives the unchanged definition projection from frozen source, and every SDK-owned receipt/head/ledger remains intact except genuine native appends. | Bind a dependency to a definition hash, change a check/spec/condition/dependency key, forge or adopt a stale receipt, remove an old head, or edit the plan during verification: explicit failure, no gate or completion claim. A real current-root parent/child control with matching native command/log/receipt fields must accept. | TEST-RELQ-PLANNING-001; isolated binding/adoption/history reversals | Actual new-root MODEL001 verification exited0 and wrote input`26cf152073bd60503ae2cbcfb4d1385b155ac7d35712b0c3d4028e9518d4b2db`, previous`3b8666465e6217d3d573ff1dd3e85103a697d617d2b26d504483dc0208fd9125`, sequence6; original plan/receipt bytes and full old ledger prefix remained unchanged. One-task report SHA`039c37f07c476fb779f3ab22a6fcc5c3028edb76876ba84e5e065b466e315c59` remains historical. The later actual reversed-order two-task native preparation/adoption control passed; full118-task preparation remains untested. |
| `REQ-RELQ-003` | The required gate uses the frozen adapter command/format, a complete current planning proof and the existing actual full-gate process/verdict rule; plan/adopted receipt/head/ledger state is byte-identical between final native admission and full gate completion. | A raw `format:gate` PASS for INTEGRATED-GATE, nested exit1 with PASS text, INCOMPLETE/SKIPPED, zero/omitted tasks, missing native logs, intervening state edit or preparation-only success rejects. Valid complete planning proof plus an actual full gate accepts. | TEST-RELQ-PLANNING-001; process/verdict/format reversals | Genuine native assertion Red preceded the small adapter implementation; `v028-gate-planning-native-green-attempt1.stdout` records actual Green, and the entire release-control file passed on Node20 at that snapshot. Eight isolated mechanisms were assertion-detected/restored in report SHA`47598e988d3744204b684c13fdc6fcbc4880b28322a1e7c5c579931fbbc0fb4c`. Later lifecycle counterexamples fail; all affected current controls/mutations and the full project gate must be refreshed. No qualifying cell or streak credit is claimed. |
| `REQ-RELQ-003` | All preparation and full-gate work fits the same12000-second INTEGRATED-GATE process budget, with one monotonic inner deadline,5000ms cleanup/serialization reserve, bounded referenced logs and owned nested-process cleanup. | Reset the clock per task, allow a native command beyond remaining time, exceed the existing8-MiB process/final-JSON budget, lose owned descendants or execute the gate after exhaustion: fail with retained phase/command evidence, never widen the budget or report PASS. | TEST-RELQ-PLANNING-001; deadline/output/cleanup controls and a full-scale scratch run | Basic one-task history append took3.9s; complete118-task preparation, dependency ordering, cleanup margin and receipt capacity remain unmeasured. Measure full preparation plus full gate before freezing; insufficient budget remains a blocking finding. |
| `REQ-RELQ-003` | SIGTERM/SIGINT received by the parent CLI during required-gate execution aborts its owned invocation; ordinary observed children stop, and the retained process result explicitly reports cancellation rather than PASS. | After a real detached child prints its readiness PID, separately signal only its parent with SIGTERM and SIGINT. The child must cease execution within bounded cleanup, and the parent must return a failed process verdict. Outer-test descendant tracking is disabled so it cannot hide the leak. | TEST-RELQ-PLANNING-001; isolated signal-propagation reversal | `v028-gate-parent-cancel-native-red-final.stdout` records the genuine expected SIGTERM assertion failure before implementation: the child remains executable. The final regression enumerates both signals; renewed native Red/Green and restored mutation remain pending. |
| `REQ-RELQ-003` | One termination ceiling covers timeout and parent-triggered abort when inherited pipes prevent native close. Nested and outer cutoff ordering leaves time for inner evidence before outer escalation, and finishes bounded cleanup inside the unchanged shared deadline. | For both a25ms timeout and an immediate abort of a600000ms command, a controlled process emits no close after TERM/KILL. Advancing the injected clock to3025ms must produce explicit incomplete cleanup/may-still-be-alive error, unknown exit and destroyed retained pipes, not a hanging promise, cleaned claim or invented exit0. Late close/data/error cannot revise the verdict or repeat cleanup. A normal observed close still accepts. | TEST-RELQ-PROCESS-001; isolated close-ceiling reversal | `v028-gate-close-ceiling-assertion-red.log` and `v028-gate-close-ceiling-final-assertion-red.log` retain expected assertion failures with1test/1failure/0skips. Native `tdd red` correctly refused the stale human lock in `v028-gate-close-ceiling-native-red.stdout`; repeat the final timeout/abort regression only after renewed approval, before implementation. Ceiling and cleanup still require implementation and validation. This controlled scheduler covers close loss, not a native self-detach cleanup guarantee. |
| `REQ-RELQ-003` | For global shared deadline D, outer work stops at D−4000ms, nested SDK work stops at D−9000ms, and the intervening5000ms preserves inner cleanup/serialization before the outer3000ms completion ceiling plus1000ms observed-child cleanup. | With D=now+12000seconds, require outer timeout11996000ms, outer cutoff D−4000ms, inner cutoff D−9000ms; remaining8999/9000ms rejects and9001ms leaves1ms inner work. Equal inner/outer cutoffs can kill the adapter before it retains timeout evidence; an outer cutoff D overruns the final deadline. | TEST-RELQ-PLANNING-001; isolated deadline-order reversal | The original unsafe deadline calculation is extracted unchanged into the actual CLI's shared `gateDeadlinePlan` call sites. `v028-gate-deadline-order-assertion-red.log` retains1test/1expected assertion failure/0skips: actual outer cutoff13000000000000ns differs from independent expected12996000000000ns. Claude Sonnet5.5 design review closed the cutoff collision finding. Renewed native Red, implementation and restored mutation remain pending; no additional budget or passing overrun is authorized. |

Parent signal propagation covers the active required-gate invocation, not
earlier source materialization or Git/probe calls. Unobservable self-detached
workers, parent SIGKILL and power loss remain outside the cleanup guarantee.
Any incomplete cleanup is an explicit failure, never evidence that every
process stopped. These limits do not permit a passing over-budget gate or
change the12000-second matrix budget. The outer command must reserve4000ms
for its own termination/cleanup and pass its earlier work cutoff to the
adapter; the adapter then reserves its existing5000ms before that cutoff.
Do not make inner and outer cutoffs equal or schedule outer termination
only at the final shared deadline.

Route only INTEGRATED-GATE through the existing cell adapter, inside its
unchanged outer deadline. Freeze its exact task/test/definition catalogue
and cell source path. Native plan check supplies actual current fingerprints;
rebind only existing author dependency values, never definition hashes.
Verify every task once using a freshly verified parent set, not copied
complete statuses. Require matching current input/definition, actual
cell-root/native-script argv and native log/hash-chain fields before atomic
mode-preserving adoption. Tie each new receipt to the actual owned,
successful native verification response/file hash; its native `tdd refactor`
argv binds the cell root and SDK script, and its `previous`/`sequence`
continues the copied namespace head. The SDK receipt schema gains no synthetic root
field: its actual native argv and current input bind the root.
SDK-owned history/receipt/ledger files are never rewritten by the harness.
Receipt-capacity exhaustion is a blocking failure, not a retry, a raised
SDK limit or permission to prune copied history.

Key old-raw-claim rejection off the required cell identity, not its
self-reported format. Reuse one shared native-gate rule:
`processControl(nestedEvidence, 0)`, exact `SDD GATE PASS` line, and no
`INCOMPLETE`, cross-mark failure or `SKIPPED` token. Do not lose these checks
when the outer result becomes adapter JSON. Retain stdout/stderr/native logs
as bounded hash-checked file references, never embedded unbounded output.
Cap each nested invocation by the remaining shared time without changing
SDK configuration or fingerprint semantics; keep incremental progress for
outer-timeout diagnosis and test cleanup of every owned nested group.

All six failure stages apply: contract = revised genuine seven-artifact
human preparation approval and unchanged matrix; trusted inputs = frozen
definitions/current native root-bound proof, not copied old receipts;
execution = genuine parent-first verification/adoption and full gate inside
one existing deadline; verdict = valid controls accept while stale,
missing, forged, unprepared, skipped, timed-out or partial evidence rejects;
history = preserve all old/failed receipts, original refused probe and
classification correction, reset relevant validation without credit;
integration/distribution = full current gate/CI, one frozen candidate,
two consecutive complete fresh runs and separate exact-artifact human
release approval. No stage is waived.
The current SDK correctly rejects stale inputs; do not normalize away that
protection or introduce a planning opt-out. This new in-scope S2 remains
blocking until the regression, restored mutations and real integration
pass. The original unidentified issue385 assertion stays separately open
and unclassified. Neither this preparation approval nor clean source-root
tests authorize main integration, tagging, publication or finding downgrade.

### Historical0.2.7 revision2 preparation

The historical scope/content revisions were both2, retaining the exact approved
revision1 scope SHA256
`ca1e5ccc404c88dedb6998f1208bcdfe3250aad3ba716525c7e3d8a958320e76`
and content SHA256
`195550f984027f5f131115be39de4150e4143bd1e0edd212c9d39e60cdab74d5`
as their predecessors. Original0.2.6 revision13/6 provenance remains unchanged.
The committed reference is
`946647fd6822de63df1a35bfcd09949ad7042230`, skill tree
`19e6e201d120d4b89c41a185507058848b2bce6b`.
Independent `v027-release-policy-spike-6AGkYy/report.json` matched all118
source/archive/npm file bytes and exact origin-specific modes. All118 paths
and modes remain unchanged; only the normal-shutdown native script and its
CLI test have new canonical bytes. The separately changed wrapper, package
metadata and three release documents also matched committed source/archive/npm.
Actual source-init and package-init on Node24.22.1 each matched Copilot118 and
Claude115 complete inventories, and24 installed/wrapper disabled0,
missing2 and malformed1 terminal controls passed. Watchdog's three
Copilot-only files remain explicitly excluded from Claude, not skipped cases.
The spike's source archive SHA256 is
`bdd15fdb64663fc7d633fe3b66ec536f7efaf5a469e4b81f938667555830ba4d`;
its offline tgz SHA256 is
`c068949417b8ae62b568705fbd219fece25e25690e2054218fca4cacf8363930`.
These identify development feasibility artifacts, not the future frozen
candidate or authorization to publish them.
The finite source product is118files times ten unchanged policies:
1180source challenges,1240vendor challenges including unchanged60origin
sensitivities, and1253total skill cases including unchanged13semantic cases.
All14 placeholder mechanisms remain unchanged. Revision1's independently
verified reference0f055b4 and skill tree6dbbbd6 remain in committed history,
with `v027-release-policy-spike-rKZZ61/report.json` and the earlier
archive/npm-only `v027-release-policy-spike-sO7vtt/report.json`.
Every spike is zero-credit feasibility, not current admission, three-runtime
full inventories or frozen qualification. The new named TEST-PLAN-CLI-006
remains required through actual registered discovery, not an omitted case.
Its reviewed deterministic exit-boundary regression replaces a V8 diagnostic
timing oracle that also stopped the repaired Node22 natural path. Retain all
failed stress-oracle matrices, native stack diagnostics and original hosted
timeout as history, not successful retries. The public0/1/2 contract, every
state/entry/deadline and all release-cell policies remain unchanged.
`.sdd/evidence/v027-cli-shutdown.json` records genuine native Red/Green,
12 isolated dispatcher reversals,20/20 unfiltered targets on each20/22/24,
36 bounded repeated regressions,111 source-installed lifecycle calls,
scoped diagnostics and actual current15-task re-adoption with byte-identical
default-disabled configuration restoration. That checkpoint does not replace
current human reference approval, original full gate, same-head hosted checks
or two clean frozen runs. Revision2 starts with zero qualification credit.

### Frozen-history execution amendment

The first frozen revision2 run `qualification-v027-linux-r2-frozen-rOukzS/
runs/run-Kz6a5c` passed20 cells, then failed REGRESSION-20 with four genuine
setup errors: the package-binding, baseline, skill and placeholder self-tests
could not archive approved commit946647f because suite materialization omitted
Git metadata. These are not assertion Red evidence, a runtime deadlock or a
qualification pass. The run is retained, streak0; the second run did not start.

Executed regression suites must restore the already frozen digest-bound Git
bundle and exact candidate commit just as the integrated gate does, then
overlay the exact frozen source bytes without losing that private Git history.
Registration-only discovery uses an explicit internal `discovery` kind,
supplies no history and executes no test body; it remains Git-free.
Like other copy-only kinds, discovery deliberately ignores any supplied
history descriptor and still cannot obtain Git metadata from it.
An executed `suite` without history must reject, not become discovery.
Gate/suite descriptors must reject absent, null or partial values, a changed
bundle or an unavailable candidate commit. The frozen bundle must also
retain the historical approved reference as an ancestor of that candidate;
the actual archive self-tests and independent bundle spike verify this.
Reject unexpected root Git metadata in the source overlay before cloning.
Other cell kinds deliberately remain frozen-source copies without consulting
supplied history; they must not obtain private Git metadata from it.
Never fall back to live repository history, fake initialization, skips or
new expected inventory bytes. Preserve the gate's existing bound-input and
post-cell integrity checks for the bundle and frozen source.

| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-RELQ-002`, `REQ-RELQ-003` | An executed suite and gate can archive ancestor fixture commitA from their private frozen bundle, retain bound candidate HEADB and expose independently specified overlaid source bytes. Explicit discovery and other cell kinds remain Git-free. | Gate/suite valid bundle => archiveA, ancestorA/B, HEADB and overlay bytes; discovery without/with history => deliberate Git-free copy; other kind with history => deliberate Git-free copy; gate/suite absent/null/partial descriptor, changed bundle digest, absent commit or overlay root `.git` => explicit rejection before source substitution. | TEST-RELQ-GIT-001; finite kind/history/error controls, isolated restoration-policy reversal, current26-plus-new controls and final fixed24-cell runs | Frozen REGRESSION-20 failed with four setup errors. Independent `v027-suite-history-spike-P14wwx/report.json` restored the retained bundle, proved approved946647f is ancestor of candidate20aa49b and matched all118 historical canonical bytes/modes. New owning assertion Red/Green and bounded restored mutation remain pending genuine renewed human approval; spike credit0. |

First-failure stages: contract -- no required cell, case or budget changes;
trusted inputs -- use only the already bound bundle/commit, reject corruption;
execution -- restore private history for executed suites, not discovery;
verdict -- require actual historical bytes, HEAD and valid Git-free controls;
evidence history -- retain the failed run and freeze a new manifest with its
predecessor hash/reason and zero streak; integration/distribution -- rerun
unchanged required checks and two identical complete fresh24-cell runs.
All six stages apply. This amendment grants no merge, tag or publication
authority and changes neither canonical skill inventory nor accepted modes.

Implement only the current version-bound paths, selected stable version and
exact approved inventory counts; avoid a new multi-version policy abstraction.
Cut over the seven-element `locked` array, `scopePaths`, stable `targetVersion`
and its positional `locked[1]` scope/`locked[6]` content bindings together;
no old0.2.6 path or target may remain in current admission/execution.
Historical self-contained publisher-shell fixtures remain valid unchanged.
Record current native commands/results, failures, source bindings, restored
mutations, independent review limits and unverified checks in
`.sdd/evidence/release-v027-development.json`, linked to this contract's exact
digest. This prospective contract does not itself claim those checks ran.

| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-RELQ-001`, `REQ-RELQ-005` | Only a genuine current seven-artifact stable0.2.7 plan admits; actual execution and installed receipts require stable0.2.7. Every inherited cell/budget remains required. | Prior0.2.6 or prerelease0.2.7-dev.0 targets/receipts, stale seven-artifact locks, substituted archive/hash or omitted cell reject; the approved stable0.2.7 control accepts. | TEST-RELQ-001, TEST-RELQ-005, TEST-RELQ-CONTENT-ADMISSION-001, actual package cells; isolated version/execution/verdict reversals | Revision1 adapter development passed26 controls per20/22/24 and11 isolated mechanisms in the retained development report. Revision2 requires a fresh genuine human artifact lock and current admission checks; no prior result grants renewed approval or run credit. |
| `REQ-RELQ-002`, `REQ-RELQ-003` | Every old111 path and each of seven new planning paths has its exact committed source/package bytes/modes and all ten source policies:118files/1180source/1240vendor/1253total skill cases; all60 origin sensitivities remain. | Drop any new helper/test, retain stale111-file counts, omit any byte/mode policy, retain mismatched lineage or alter one frozen byte/mode: reject; the complete independently checked reference and exact restoration accept. | TEST-RELQ-SKILL-001, TEST-RELQ-LINEAGE-001, TEST-RELQ-BASELINE-001; finite seven-file by ten-policy rows and isolated catalogue/inventory reversals | Current6AGkYy spike matched all118 unchanged paths/modes, both changed canonical hashes, five root package inputs and full source/package both-host inventories;24 terminal controls passed on Node24. Earlier spikes and failures are retained. Current admission and new-regression discovery await preparation approval; no qualification credit. |
| `REQ-RELQ-004` | Two complete clean runs of one unchanged stable0.2.7 candidate/manifest in fresh state yield technical readiness only. | Reuse0.2.6 history, alter source/counts/matrix between runs, skip a required planning regression or publish without exact-artifact human approval: no readiness/publication. | Existing full frozen24-cell launcher and complete streak-transition controls | The original e6ea683 checkpoint full gate passed but required hosted Node24 CI later timed out; both remain history. Repair946647f has local development evidence and15 current adopted tasks; fresh complete qualification streak is0. Current approved-reference full gate, same-head CI and publication remain pending. |

All six first-failure stages apply: contract -- genuine stable0.2.7
seven-artifact approval and unchanged support policy; trusted inputs --
independently committed inventory/modes, consistent lineage and exact tgz;
execution -- actual native package/registered regressions and unchanged
budgets; verdict -- valid controls accept while wrong versions, omitted
paths/policies and invalid evidence reject; evidence history -- preserve
old contracts/failures and reset every relevant revision to zero;
integration/distribution -- original-policy full native gate, current-head CI,
two unchanged complete fresh runs and separate exact-artifact publication
approval. The stale version/reference fixture first violates contract-bound
trusted inputs; diagnostic wording portability is a separate verdict repair.
No stage is waived, no required scope/case is narrowed and no S1/S2 is downgraded.
Windows/macOS, actual WSL containers and live Claude interactions remain outside
the Linux-only qualification guarantee.

### Historical0.2.6 preparation, retained without current credit
Use `.sdd/release-validation.v0.2.6.json` revision 13 and `.sdd/release-content-mutations.v0.2.6.json` revision 6; preserve earlier revisions and failed evidence. Revision 13 preserves every revision-12 cell, timeout, exclusion, legacy diagnostic rule and historical test mapping. Correct the stale historical lineage source commit to the same approved 1dccdfb as the vendor reference, as the unchanged validator requires: Git confirms the historical sdd.test.mjs digest is identical at original b30a1bd and successor 1dccdfb. Required Node20/22/24 regressions must discover the four new Windows runner tests; native Windows CI remains independent development evidence, not an expansion of Linux release support.

The independent Git/archive/package spike verified all 111 committed skill files: the old 109 remain, sdd.mjs has the approved Windows fixes, and windows-native.test.mjs/windows-runner.test.mjs add two files. The successor reference uses committed 1dccdfb after repairing only diagnostics.test.mjs's owned-process test cleanup; every file and source/package mode is preserved. Preserve every old byte/mode policy and all 60 origin sensitivities. The same ten source policies apply to 111 files: 1110 source challenges, 1170 vendor challenges and 1183 total skill-cell cases, with unchanged 13 semantic and 14 placeholder mechanisms. This is a prospective fingerprint revision before new qualification, not weaker scope or transferred credit.

The existing publish workflow repacks unchecked source and therefore does not enforce identity with the human-approved tgz. Before freezing, strengthen its existing Publish step: pack once with scripts disabled, require a version-matching annotated release tag for every non-dry-run invocation, extract exactly one lowercase 64-hex `Approved-Package-SHA256: <digest>` line from that tag, verify the actual tgz with SHA-256, then pass that same path to npm publish. Explicitly fetch only the remote tag into FETCH_HEAD without overwriting local refs, require its peeled commit to equal checked-out HEAD, and read its actual tag object: actions/checkout may flatten a tag ref to the triggering commit. Reject branch refs, remote lightweight/wrong-version tags, moved commits, absent/malformed/duplicate digests, missing archives and changed bytes before invoking npm publish. A branch dry-run may inspect a candidate but must retain --dry-run; an explicit non-dry-run dispatch on the correctly bound tag follows the same checks as a tag push. The tag digest is an artifact binding, not proof of human approval or readiness; create the annotated tag only after two qualifying runs and separate exact-artifact human publication approval. Credentials stay in the existing GitHub npm environment; local npm whoami currently returns 401, and secret-name availability alone does not establish a working publishing identity. Compare genuine Node20/22/24 npm-packed bytes before freeze; any CI repack mismatch stops publication rather than accepting a replacement hash. Local fixture acceptance is not a claim that hosted tag publication has already succeeded.

| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-RELQ-001`, `REQ-RELQ-005` | Admit only the human-bound stable 0.2.6 plan and verify the actual 0.2.6 tgz; preserve the full 24-cell policy. | Approved-shape target 0.2.5 or 0.2.6-dev.0 rejects; valid 0.2.6 accepts. Wrong execution target or installed receipt version rejects; genuine package controls accept. | TEST-RELQ-001, TEST-RELQ-005, TEST-HOST-005; restored version/execution/verdict mutations | Official assertion Red/Green passed for TEST-HOST-005, TEST-RELQ-001 and TEST-RELQ-005. Genuine package controls passed on Node20/22/24; restored version/execution/verdict mutations were detected. Retained command/log hashes are recorded in `.sdd/evidence/release-v026-development.json`; these are development controls, not frozen qualification credit. |
| `REQ-RELQ-002`, `REQ-RELQ-003` | All 111 Git-bound file/mode rows and 1183 named skill cases are present, including all ten policies for each new Windows test file; the old 109 rows and all 60 origin cases remain. | Drop either Windows file, retain the stale 109-file catalogue, omit a byte/mode policy, or alter one frozen source/package byte: reject. Complete unchanged inventory and exact restoration accept. | TEST-RELQ-SKILL-001, TEST-RELQ-LINEAGE-001, native preflight; restored catalogue/inventory mutations | The independent Git/archive/package spike verified 111 files and exact modes. TEST-RELQ-SKILL-001 assertion Red/Green and stale-catalogue/omitted-file mutations passed with restored controls. See `.sdd/evidence/release-v026-development.json`; the prospective frozen two-run matrix remains pending. |
| `REQ-RELQ-005` | A genuine version-matching remote annotated tag with one approved SHA-256 and matching packed bytes reaches npm publish with that exact tgz path, for tag push and tag dispatch, including checkout-flattened local refs. Every invalid tag/digest/archive row stops before publication; branch dry-runs retain --dry-run. | Annotated v0.2.6 with digest of A but actual tgz B, missing/short/duplicate digest, remote lightweight v0.2.6, annotated v0.2.5, moved remote commit, branch ref or missing tgz: reject with no publish marker. Matching v0.2.6/A accepts even if the local tag ref is flattened; a branch dry-run is non-publishing. | TEST-RELQ-PUBLISH-001 executes actual workflow shell with real isolated Git remotes/tags/SHA-256 and a recording npm fixture; real multi-npm pack/install controls remain separate. Restore hash-check, tag/commit checks and exact-path mutations after detection. | Initial unchecked-source assertion Red/Green passed. Independent review exposed an unbound dry-run environment oracle; a subsequent official assertion Red detected an isolated always-true guard and restoration Green passed all 21 rows, including all eight ref/event/input states and explicit pack/auth error controls. Ten current publisher mutations were assertion-detected with passing baseline/restoration, including event-policy and pack-call mutations. `.sdd/evidence/release-v026-development.json` retains actual evidence and limitations. Full gate, hosted identity, frozen qualification and human publication approval remain separate; no release tag or publication is claimed. |
| `REQ-RELQ-005` | The publish workflow explicitly provisions the existing GiNZA test's uv runner after selecting Python 3.12 and before running npm test; a failed installer stops execution. | A clean hosted runner without uv must not depend on accidental image contents. Removing the provisioning step or masking its nonzero exit rejects; explicit provisioning and a successful installer accept. | TEST-RELQ-PUBLISH-001: execute the actual provisioning shell with recording Python for successful/nonzero installer controls; independently run TEST-GINZA-001 and hosted publish dry-run. | Hosted run 41535041561 on candidate 00fa172 failed TEST-GINZA-001 with spawnSync uv ENOENT before the publishing job; this setup failure is not assertion Red or authentication evidence. First failed condition: trusted-input availability, exposed by integration provisioning. Stop and retain frozen manifest 224bd7a02839c95c5c49b6284be5eba445abe3ae62ff6bd4837f0a967346d181 and its interrupted first run with zero credit. Preserve the 24-cell policy and use a new committed candidate/frozen revision after the fix; actual subsequent command/log evidence is retained in `.sdd/evidence/release-v026-development.json`. |
| `REQ-RELQ-003`, `REQ-RELQ-005` | Required tests retain all existing assertions while cleanup accepts only an already-absent owned process; permission and unknown errors still fail. The exact changed packaged test bytes are rebound before fresh qualification. | The descendant exits after the running probe and final kill throws ESRCH: cleanup must not replace the test result. Suppressing EPERM/EIO/unknown errors, targeting a different PID/signal, or admitting the old package/reference bytes rejects. | TEST-DIAGCLI-CLOSE-001 injected success/ESRCH/error controls and unchanged 12 close-time rows; three isolated restored cleanup mutations; native Git/archive/package controls on Node20/22/24. | Hosted41541792484 passed uv installation and TEST-GINZA-001 but failed test-owned final kill with ESRCH. First failed condition: test execution, not provider policy. The deterministic missing-process assertion failed before repair; formal Green refused changed shared-oracle bytes, so subsequent passing checks are honestly recorded as Refactor, not a new same-hash production Red/Green pair. All three mutants assertion-failed with baseline/restoration. Git1dccdfb independently verified all111 files/modes and new tgz e9224470664bdceff070db24d927d0aae29dc80cdfe430d5e568426ed07b9bde; revisions11/5 and interrupted manifest224bd7a0 remain zero-credit history. Full successor qualification and npm identity remain unverified. |
| `REQ-RELQ-001`, `REQ-RELQ-002` | The historical lineage and approved vendor reference identify the same committed source and exact historical suite bytes; all mappings remain required. | Revision12 retained lineage b30a1bd but vendorReference was 1dccdfb: admission must reject. Rebind lineage to 1dccdfb containing the independently verified identical suite digest: accept. Unknown commit, changed digest, missing mapping or stale approval still rejects. | TEST-RELQ-LINEAGE-001, TEST-RELQ-CONTENT-ADMISSION-001, complete qualification self-tests; isolated stale-commit mutation with restored control. | Hosted41553255487 failed nine admission-dependent tests, skipped publishing; direct admitPlan reports b30a1bd != 1dccdfb. Genuine TEST-RELQ-LINEAGE-001 assertion Red recorded before correction. Git at both commits yields efa2b21e7de2e10529c7010e8cb8a66531c78576e8cc4469a80821be14e870b2. The earlier inventory review did not detect the metadata inconsistency; its clean verdict is not an admission PASS. Corrective Green, restored mutation, full gate, hosted identity and qualification remain pending. |

All six first-failure stages apply: contract = human approval of stable 0.2.6, the explicit 111-file successor inventory and mutually consistent lineage/reference metadata; trusted inputs = exact committed blobs, archive/tgz/modes and bound dependencies; execution = actual package/native controls and unchanged per-cell deadlines; verdict = valid controls accept while wrong versions, omitted files/policies, stale lineage commits and invalid evidence reject; evidence history = preserve every old manifest/run, reset revision 12 to zero and never reuse Windows development credit; integration/distribution = two complete fresh runs of one unchanged manifest/source/tgz followed by separate approval of every exact artifact path/hash and residual risk. The lineage-metadata S2 first violates the contract; no validator or test is weakened to admit it. No stage is waived. Relevant changes or in-scope S1/S2 findings reset/block qualification. Plan approval is not tag/publication approval.

### Inherited qualification design and historical amendments
The approved repository plan is the support/cell-policy source of truth. A generated external frozen manifest adds exact candidate/runtime/helper/configuration/catalogue digests without mutating that approved plan. Results and logs are separate outputs, not self-referential candidate inputs.
Recover original helpers as data, verify historical SHA-256, then retain/adapt the executable validation logic and tests in source control. Legacy paths, counts, source hashes and environment fingerprints are never accepted as current evidence.
Launch each cell from a fresh isolated candidate copy with a canonical per-runtime PATH; retain original timeouts and all non-WSL mutation/differential/native controls. Local tool/configuration execution is trusted, not sandboxed or remotely attested.
State table: pending prerequisites => incomplete; frozen inputs => streak0; complete clean run => increment; any failed/incomplete run or input revision => streak0; two unchanged fresh clean runs => technical-ready; no state grants publication.
The closure boundary includes explicitly selected Node/npm installation assets, the installed Node dependency tree, Gradle JAR inputs and the prose Python environment (interpreter and installed packages), together with execution paths in the manifest. Resolve symlinks before deciding whether a frozen tree covers an input. Record the declared Linux/toolchain baseline separately; this is trusted-local execution, not a claim to hash every operating-system library or provide hostile-host attestation. Mutable per-cell homes/caches remain outputs, not frozen inputs; an execution cache used as a preinstalled dependency must have an explicit stable-input boundary and isolated writable state.
Every configured input must have a bound file or bounded installation/dependency tree containing its resolved real path. Record discovered interpreter paths as absolute configuration inputs before freezing; a prose interpreter must not be rediscovered from PATH during qualification. Use selected installation roots, not an unbounded whole-filesystem scan, to bind installed packages.
Missing input fingerprints, an absent expected manifest digest, an empty matrix or an unbound command catalogue cannot be made valid merely by recomputing a manifest's own hash. Production readiness consumes the retained manifest and immutable history; injected process probes are test seams only, not a CLI option or evidence of genuine tool availability. Recheck all bound inputs before and after each run; a relevant change requires a new manifest revision, an explicit old/new digest/reason and zero streak.
Record observed Red/Green, isolated mutation/restoration, reviews and final-run evidence in retained machine reports linked to this specification's exact digest. Pending observations above remain historical planning statements, not evidence that a command ran. This amendment strengthens the existing five requirements; it removes no required cell, reduces no budget, downgrades no finding and grants no publishing authorization.
### Legacy native-diagnostic amendment requiring fresh approval
Plan revision 7 retains the complete inherited 49-case legacy mutation catalogue, including its original diagnostic strings as historical provenance. It does not reinterpret or weaken the edits, selected tests, exact assertion ownership, native error family, exit policy or baseline/restoration requirements. Within that legacy catalogue, for each selected `assert.match` with an independently parsed regular-expression literal and no custom-message argument, freeze the exact expected Node native message prefix and its assertion line from the test AST before execution. At that owned frame, require that exact prefix instead of the generic historical diagnostic-word expression; do not OR the two conditions, infer a prefix from actual failing output, or accept a different expected regex. Other selected legacy assertions, including `assert.match` with a nonliteral expected regex or a custom-message argument, retain the inherited expected-reason check except for the two exact scanner overrides declared in the approved plan. Each override must resolve its original case ID, suite and expected-assertion anchor exactly; freeze its complete prefix and owned line before execution. Missing, duplicate, foreign or mismatched overrides are setup failures, not permission to fall back. The two prefixes are derived from the independent one-requirement fixtures and declared trace counting rules. Do not generate replacements from observed failing messages or widen the generic-word expression. Native Node feasibility confirms `assert.match('a', /b/, 'custom')` emits only `custom`, not the generated regex diagnostic. Missing or ambiguous assertion metadata is a setup failure.

The separate 57-case diagnostic-mutation catalogue retains its inherited owned-native-assertion policy. Freeze its selected assertion lines with the existing `legacy` diagnostic kind, not a generated-regex prefix; an independently owned native argument-type assertion is a valid detection there. Both adapter and consumer still require its exact name, native code/family, throwing frame, all passing controls, process receipts and exact restoration. Missing metadata, actual loader errors and foreign assertions remain invalid. Do not apply a legacy-only message contract to this separate catalogue. Pin this boundary with a failing native null-input regression before correcting it, then mutate the boundary back in isolation and confirm rejection by the regression.

Version-cutover first-failure stages are all applicable: contract -- human reapproval of stable 0.2.4 and its version-bound host requirement; trusted inputs -- root/lock/archive identities must agree and 0.2.3 artifacts cannot substitute; execution -- actual version, pack and installed-entry controls; verdict -- old/prerelease metadata and invalid diagnostic evidence reject while the valid 0.2.4 candidate accepts; history -- preserve failed 0.2.3 manifests and reset the streak; integration/distribution -- two complete fresh runs for the exact 0.2.4 archive and separate publication approval of every exact artifact path/hash and residual risk. Requested commit/push does not replace these publication prerequisites.

Treat a setup-looking string inside a verified owned native assertion message as quoted diagnostic data, not proof of an import/provider failure. An exemption from the raw-text setup heuristic must first require a complete parseable native verdict, exactly the selected failing test, and the frozen native assertion code, source file and throwing line. It must not be a caller-controlled skip flag. Real setup errors, assertions thrown by a foreign frame, malformed evidence and absent controls remain failures. Apply the same rules in both the adapter and the independent retained-evidence consumer.

This amendment's first-failure stages are all applicable: contract -- explicit human approval of the replacement diagnostic rule; trusted inputs -- literal regex and owner from the independent frozen test, never observed output; execution -- retain complete native receipts and actual baseline/mutant/restored exits; verdict -- exact diagnostic/frame checks with positive controls and negative boundary cases; evidence history -- preserve the failed previous manifest/run and reset to zero; integration/distribution -- freeze new helpers/catalogue/contract/candidate digests and execute the unchanged 24-cell matrix twice. A prototype or one corrected cell contributes zero qualification credit. Both new mechanisms require assertion Red/Green and bounded restored mutation evidence before new qualifying runs. Any further required-case weakening still needs explicit human approval.
Linux x86_64 is the qualification platform. Actual WSL container execution is explicitly excluded at the user's request; Windows/macOS and live Claude interactions remain unverified. Keep packaged WSL assets and Linux-side syntax/refusal checks; do not claim WSL runtime validation.
### Explicit replacement for unavailable content-mutation contracts
Plan revision 7 carries `.sdd/release-content-mutations.v0.2.4.json` revision 2 as the version-only successor to the approved 0.2.3 revision-1 reference for the existing SKILL-MUTATION and PLACEHOLDER-MUTATION cells. Cases, vendor references, origin policies and budgets are unchanged. All 24 required cells and runtime selections remain unchanged; each of these two cells retains Node24 and 3600 seconds. The original replacement was a new human-approved executable contract, not recovery of the original mutant edits, assertion selection or seven unknown vendor-path identities. The 0.2.4 artifacts require their own exact approval; old approval or execution credit does not transfer.

The catalogue retains the 13 independently documented skill intents and 14 placeholder intents, with concrete edits, independent golden inputs/expected results and native target assertions. Scoped edits match exactly once within the named top-level function, ending before the next top-level function/class definition; missing or ambiguous anchors are setup failures, not kills. Skill cases include excluded skill/cache inputs, the local placeholder exception and protected-review behavior. Placeholder policy enumerates all 64 ASCII marker case variants, declared whitespace/colon/annotation rows and token-local code/link/URL/identifier contexts. Its exact row-generating test source and hashes are independent oracle inputs, not classifications obtained from the mutated linter. A whole-suite success cannot replace exact named case coverage.

The initial vendor reference explicitly approved all 109 files across ten committed skill trees against Git commit `b94dbe1f66f72355fd0f1bd3cce6f5e3dd55588d`. The current committed-byte successor is specified below. The declared synchronization, placeholder and GiNZA specs identify intended local deltas. This reference establishes the accepted musubix candidate, not byte equivalence to historical upstream. Exact source modes require approval because Git records only executability. Never regenerate expected bytes/modes from a mutated input or comparator output.

The 1090 source vendor cases are exactly the Cartesian product of 109 named files and ten policies: append one ASCII newline, or XOR exactly one of the nine permission bits 001 through 400. Another 60 explicitly named origin-sensitivity cases apply those ten policies to two frozen representative files (one executable and one nonexecutable) in each of source-init, package and package-init. These require real candidate CLI baseline controls for initialized origins; both supported hosts have positive inventory controls. Freeze the selected challenge host/argv/assertion before execution. The 60 cases test origin-specific mode/content checks, not all host/file products. SKILL-MUTATION therefore requires 1163 named cases (13 semantic + 1090 source + 60 origin); PLACEHOLDER-MUTATION requires 14.

Each vendor case uses a fresh private origin inventory, verifies the complete baseline, detects the precise byte/mode assertion, restores the exact bytes/mode and verifies the complete inventory again. Check mode before reading content so removal of owner-read is an assertion detection, not an EACCES setup failure. Cover required missing/extra/duplicate paths, forbidden obsidian/cache artifacts and external symlinks with explicit negative controls. This finite set is not all possible byte changes and does not prove equivalence to the missing seven-path catalogue.

Full nine-bit permissions are compared to separate frozen origin references: source and source-init retain `mode`; npm package and package-init retain `packageMode` (0644 or 0755, determined from the approved executable role before mutation). npm's portable archive normalization is legitimate, not an unauthorized cross-origin mode change. Archive inspection/extraction must preserve stored modes before comparison; ordinary extraction under restrictive umask must not redefine the oracle. Source/package and Copilot installs contain ten skills/109 files. Claude installs contain nine skills/106 files, preserving the existing Copilot-only agent-watchdog exclusion; this is not a skipped required test. All applicable files retain the approved bytes. The 60 additional sensitivities use explicit Copilot install targets (and hostless extracted-package targets); both hosts retain positive inventory controls, not a claim of exhaustive Claude mutation coverage.

Use real selected Node/Python target commands in isolated work, preserving all valid-input controls. Baseline/restored runs must pass; mutants must fail the exact independently selected owned assertion and native error family in retained SHA-bound raw output, with pinned argv, exit and receipt. Python AssertionError is not Node ERR_ASSERTION; unittest subtest failure counts are not Node test counts. Setup/import/provider errors, timeouts, missing receipts, wrong commands, skipped/TODO/unknown or empty selections never establish a kill. Freeze the final assertion locations, commands, helper/reference hashes and exact case IDs before either qualifying run.

Placeholder mechanisms 01-12 share the existing table assertion at line 151: require its exact ownership and a native failure diagnostic identifying at least one of that mechanism's frozen `failureWitnesses` (table row, literal input and independent expected count). An unrelated row failing at the same assertion is insufficient. The catalogue's witness pairs were checked against the independently pinned test-table generators, not against linter output.

Admission and freezing must bind all seven current approval artifacts, including the content catalogue, and enforce its plan digest. Missing or changed catalogue approval/digest must reject; the genuine matching seven-artifact unit must accept. Do not retain the old six-artifact admission shape.

Before implementation, add TEST-RELQ-SKILL-001 and TEST-RELQ-PH-001 regressions for `REQ-RELQ-003`/`REQ-RELQ-005`: confirm genuine assertion Red, preserve valid controls and reject bad evidence; then implement the two adapters and independently validate each distinct mechanism by isolated sensitivity mutation. This amendment grants neither readiness nor publication. Contract/reference/helper changes reset qualification to zero; other open S1/S2 findings continue to block readiness.
### Replacement design-spike observations and limits
External `content-mode-spike-EsFx0N/report.json` checked all 109 current source hashes against committed blobs and a real generated npm archive; all 109 source/package modes differ by legitimate portable normalization. An initial extraction without permission preservation failed its design assertion (0600 versus 0644 under umask 0077); preserving archive modes made the control pass. This was spike setup, not an implementation Red.

External `content-vendor-spike-e77UOI/report.json` executed all 1090 isolated filesystem byte/mode challenges with passing complete baseline/restored inventories in 20.524 seconds. It measured only copy/hash/mode comparison, not production native process launch, evidence validation, lexical/installed controls or either complete 3600-second cell. Both reports are under the current session's external files directory; they provide zero qualification credit. All new production helper, native regression, sensitivity, review and full-cell results remain pending.

External `content-init-spike-z0QCld/report.json` verifies the actual source and extracted-package CLI initializes both hosts with zero byte/mode differences: Copilot 109 applicable files, Claude 106. An initial probe incorrectly expected the Copilot-only watchdog on Claude and stopped with ENOENT; that setup failure is not Red or mutation credit. The 60 new origin sensitivities remain unexecuted; passing initialization controls alone do not validate their rejection behavior.
### Committed source-reference refresh and early inventory admission

Plan revision 8 binds content revision 3. It replaces exactly two content hashes,
for `diagnostics.mjs` and `diagnostics.test.mjs`, with the independently verified
blobs in commit `15cae0455fb8c9598db1b7901373fc688ca6a0cb`, skill tree
`d3006e9bf703103f5750efe10489f5ee8b033501`. That commit implements the separately
human-approved close-time deadline/native-reason repair. All 109 paths, all source
and package modes, 1163 skill cases, 14 placeholder cases, origin policies,
24 required cells and budgets remain unchanged. Preserve both older catalogue
revisions and the failed frozen manifest `3299560a413ae1a252fe82958a47316941d333648a83ec53b0a305ea811e31ab`.

| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-RELQ-001`, `REQ-RELQ-002` | The approved 109-entry source inventory passes before tool preparation; one appended newline or one changed permission bit rejects before native probes or output creation | A valid approved plan/candidate has stale content references, or preparation proceeds with modified inventory bytes/modes | TEST-RELQ-BASELINE-001; independent Git-blob/hash equality; actual preflight | Genuine byte-mismatch assertion Red against revision 2; revision-2 first run retained 16 passing cells then failed the first SKILL-MUTATION positive inventory control |

Reuse the exact existing inventory comparator immediately after successful plan
admission and before allocating preparation work or probing tools. Do not repair
references automatically, infer them from comparator output, ignore mismatches or
relax the cell's later independent baseline/restoration checks. The regression's
valid-input control reaches an explicit test-only next-stage boundary; it is not
a claim of complete native preflight. Actual frozen preparation must still pass.

All six first-failure stages apply: contract = explicit human approval of exactly
two committed reference replacements; trusted inputs = compare all 109 blobs to
the pinned commit, not mutable current files; execution = reject an invalid
source inventory before native preparation; verdict = valid input proceeds and
byte/mode counterexamples reject; evidence history = retain the failed revision
and reset credit to zero; integration/distribution = recheck source/package/init
positive controls and execute the unchanged full matrix twice. This is a
reference refresh and earlier detection, not a policy weakening or release approval.

## Stable 0.2.5 cutover and zero-credit reference refresh
Preserve the complete historical 0.2.4 scope/content contracts and qualified evidence unchanged. Create versioned 0.2.5 successors, retaining all 24 required cells, 109 inventory paths and exact source/package modes, 1163 skill cases, 14 placeholder mechanisms, all origin policies, diagnostic ownership rules and budgets. Pin any changed skill-reference bytes independently to committed Git blobs containing #381/#382; never repair references from an inventory rejection or treat changed bytes as qualification credit. Version-bound launchers, native receipts and self-test oracles must consistently target 0.2.5. Explicit human artifact approval is required before admitting the new plan, then freeze one clean committed candidate and the complete named matrix before either qualifying run.
Plan revision 9 and content revision 4 are the 0.2.5 successors. Independent comparison of all 109 paths/modes to approved commit `44e76397bfb1cfe11b79b6e959ffd7912000ac75`, skill tree `0e87f2265392e0aa9c5edbbdea31b0e55bd38ac2`, found exactly four changed byte references: the two development SKILL.md files and lean-sdd-tdd's sdd.mjs/sdd.test.mjs. Refresh only those digests and any matching origin-reference digests; keep every mutation/policy row and mode unchanged. The isolated version/CLI/offline-pack/both-host spike passed, with zero qualification credit. Historical content fixtures retain this exact committed skill tree; developmental package fixtures may explicitly overlay current package/lock metadata to test 0.2.5, but qualifying origins must consume the exact newly frozen 0.2.5 tgz, never a repacked historical package.
| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-RELQ-001`, `REQ-RELQ-002` | New plan retains every inherited required cell/budget; 109 independently pinned committed references and exact modes pass inventory admission before probes | Remove a cell, reduce a budget, preserve a stale #381/#382 byte digest, alter a permission bit or use a 0.2.4 artifact lock: reject; complete genuinely approved 0.2.5 plan/current inventory: accept | TEST-RELQ-001, TEST-RELQ-BASELINE-001; independent Git-blob reference comparison; preflight | Pending new-plan approval and current native controls |
| `REQ-RELQ-005` | Actual stable 0.2.5 tgz/entrypoint receipts match exact file/hash/runtime and helpers on Node 20/22/24 | A 0.2.4 or prerelease receipt, substituted tgz/hash or missing helper: reject; exact stable 0.2.5 receipts: accept | TEST-RELQ-005, TEST-RELQ-HOST-001, TEST-HOST-005; isolated version/receipt sensitivities | TEST-HOST-005 genuine old-0.2.4 assertion Red before the npm version bump; actual stable 0.2.5 source/lock/pack/both-host Green. Package-adapter 0.2.5 acceptance and old-version rejection regression written before correcting its old 0.2.4 execution/verdict constants; official Red/Green pending artifact approval. |
| `REQ-RELQ-004` | Two consecutive complete clean runs for one unchanged 0.2.5 manifest/candidate yield technical readiness only | Reuse 0.2.4 runs, change source or matrix between runs, skip an inherited required case, or publish without exact-artifact human approval: no readiness/publication | Retained freeze/check/run/status launcher and every streak-transition self-test | New qualification streak 0; no previous release/development gate credit |
All six first-failure stages apply: contract = explicit 0.2.5 scope/reference approval without weakening; trusted inputs = current committed reference blobs, new exact source/tgz/tool closure and strict versioned locks; execution = fresh isolated native state and all unchanged commands/budgets; verdict = invalid metadata/evidence rejects while valid controls pass; evidence history = retain 0.2.4 history and all new failures, reset on revisions; integration/distribution = actual Node 20/22/24 package installs, two fixed-matrix runs and separate final npm publication approval. No stage is waived. Windows/macOS, actual WSL containers and live Claude interactions remain explicitly unqualified.

### Revision 10: explicit historical test lineage, no silent omission
Native zero-credit preflight of revision 9 discovered 1156 current names but refused five absent historical names: one corrected #r25a Rust description and four TODOs resolved by #381. The user explicitly chose committed lineage and mandatory execution of the resolved TODO replacements. Preserve the failed preflight, approved revision 9 bytes and interrupted development gate; none is a completed gate or qualification credit.
The plan alone declares exact old/new names, rename versus TODO-promotion, reasons, source commit and the canonical suite byte digest. Admission must reject unknown fields/kinds, duplicate or unknown historical sources, empty/duplicate target lists, identity mappings, wrong TODO classification and stale suite bytes. Discovery must resolve every historical name through either identity or an approved replacement; all targets must exist, and no replacement may remain a TODO exclusion. Freeze and recheck use the same resolved required/excluded catalogues. Keep unrelated inherited catalogues and all cells/budgets unchanged. Do not rename canonical skill tests, mutate historical JSON, accept missing names by prefix, or infer a mapping from observed output.
Old-name provenance is the SHA-bound inherited manifest, not commit 44e7639: that newer commit already contains #381's replacement tests. `sourceCommit` and `suiteSha256` identify the target suite and must equal its approved content-catalogue reference; current bytes must match that independently checked committed blob. The mapping does not claim old names still exist in the target blob. Enumerate all eight catalogue-present/registered-present/excluded membership states for each of the five unique replacement names: only present/present/not-excluded passes, both at freeze and after a manifest is structurally rehashed for recheck. Native preflight/prepare sensitivities must also demonstrate missing replacement rejection, with valid controls and explicit zero credit.
| REQ | PASS condition | counterexample / expected | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-RELQ-001` | Exactly declared committed source names resolve through structurally valid, human-locked lineage | Duplicate an old source, classify an old required case as TODO-promoted, remove targets, change suite bytes or add an unknown kind: reject; unchanged approved mapping: accept | TEST-RELQ-LINEAGE-001; bounded admission mutation | Revision 9 preflight failed on the exact missing #r25a name; five mismatches retained in v025-catalogue-blocker.json. Revision 10 assertion Red/Green pending. |
| `REQ-RELQ-002` | All identity/replacement names exist in the discovered and frozen required regression catalogue | Delete TEST-RSTUB-003, retain only the obsolete name, or drop a lineage row: reject before credit; complete current catalogue: freeze/check accept | TEST-RELQ-LINEAGE-002; isolated required-name sensitivity | Pending; no completed development gate or frozen run under revision 10. |
| `REQ-RELQ-003` | Former TODO replacements are actual required tests, not exclusions | Add TEST-RSTUB-001 to excludedTodos or report its missing/skip/TODO result: reject; complete named PASS controls: accept | TEST-RELQ-LINEAGE-002; existing named-verdict regression; bounded exclusion mutation | Pending; earlier #381 development evidence is historical, not release qualification credit. |
All six first-failure stages apply: contract = explicit reviewed lineage and human seven-artifact reapproval; trusted inputs = exact committed suite/hash and exact old/current names; execution = actual replacement bodies run in fresh native state; verdict = missing/skip/TODO replacements fail while valid controls pass; history = preserve revision 9 failure/interruption and reset validation; integration/distribution = new clean candidate/freeze and two unchanged full 24-cell runs before separate exact-package publication approval. No stage is waived and no policy is weakened.

## Stable 0.2.7 revision 3: failed-publication oracle successor

This is the current preparation checkpoint; earlier revision2 statements above
remain historical, not current readiness. Tag workflow `41898861716` failed
`TEST-DIAGCLI-CLOSE-001` and skipped publication after the two clean runs of
frozen manifest
`f8dae968dc12412dc174241be70657992e7c8d31e7618c0a4b0a95bc3787c351`.
Retain both runs (`run-Lo02Jd`, `run-sWewCX`), the hosted failure and all bounded
reproduction outcomes. None transfers credit to this successor.

Scope/content revisions3/3 retain their exact revision2 predecessor digests.
The new independently checked committed source is
`7ae4cb01934fe7835e0c26038d4a2156b2928170`, skill tree
`b8f263ac34a586fe37d083cb72870ef6116ab514`.
Only `diagnostics.test.mjs` changes among the118 canonical paths; its digest
changes from
`62e481e0e708679889da7b984e2c1438071a08da0e061f7a432e1e4759b07519`
to `ea2f5f38bfdb3ef68cd4845c39bd980f6ff22272244f1abe32b890fe46b8c82d`.
All paths, source/package modes,24 required Linux cells, budgets, exclusions,
1253 skill cases (13semantic/1180source/60origin),14 placeholder mechanisms,
historical mappings and verdict policies remain unchanged. Production
diagnostic behavior, worker payloads, cleanup assertions and budgets do not change.

Independent `v027-release-policy-spike-qbEFO3/report.json` (SHA256
`77d725d1a3431f7975a35709cc615f1364d53292c0b2c74bcf3576f64371d477`)
matched all118 committed/source/archive/npm paths and exact origin modes,
both source/package host initializations (Copilot118/Claude115), five root
package inputs and24 terminal controls. Its source archive SHA256 is
`93ec8ae4f99eb7ef761f4c715967186857dd180e83868b03ec62ead34c2b8cb3`;
development-only npm SHA256 is
`fad58198d8d296195147adbb21e3eb9325432e5d6c0045cb126369b6d69001e0`.
These Node24 feasibility outputs are not frozen qualification or approved
publication artifacts.

| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-RELQ-001`, `REQ-RELQ-002` | Genuine current seven-artifact approval admits the unchanged24-cell successor and complete committed118-file inventory; lineage and reference point to the same committed suite | Old revision2 approval, old diagnostic-test digest, mismatched lineage, missing path/mode/policy or weaker cell rejects; exact approved revision3 control accepts | TEST-RELQ-001, TEST-RELQ-BASELINE-001, TEST-RELQ-LINEAGE-001, TEST-RELQ-CONTENT-ADMISSION-001 | Independent committed/archive/npm/both-host spike passed; human preparation approval and current admission remain pending |
| `REQ-RELQ-003` | Every Node20/22/24 regression catalogue contains and actually executes TEST-DIAGCLI-PROCSTATE-001 plus all previously required names | Missing/excluded/skipped new oracle regression or any inherited required case rejects; complete exact named PASS results accept | Native preflight/registered discovery, REGRESSION-20/22/24 | Test-only repair evidence is committed in `.sdd/evidence/v027-close-oracle.json`: genuine X and live-R Red/Green,36 isolated detections,39 controls and36 two-test live invocations; zero qualification credit |
| `REQ-RELQ-004`, `REQ-RELQ-005` | New committed candidate, original-policy full gate, same-head hosted checks and two identical fresh complete runs yield technical readiness only | Reuse either old clean run, mutate candidate/manifest, substitute bytes, force-retag or publish under the old approval: reject | Native gate, CI, freeze/check/run/status and existing streak/publication controls | Native guard correctly rejects the stale release artifact lock. Full gate, successor qualification and new exact-artifact publication approval remain outstanding |

First violated stages: verdict for the old X-state false-live observation;
trusted-input field parsing for the greedy command-name false-terminal case;
contract for the now-stale release artifact lock. The independently reviewed
diagnostics contract governs the assertion-first test-only correction.
All six stages apply: contract = genuine seven-artifact reference approval;
trusted inputs = independently committed bytes/modes and field ownership;
execution = unchanged native cases/budgets in fresh state; verdict = live
controls accepted, invalid evidence rejected; history = retain failures and
zero inherited credit; integration/distribution = new frozen candidate and
two consecutive unchanged runs, then separate exact-artifact human approval.
No stage, policy or case is waived and no S1/S2 finding is downgraded.
The existing tag remains unchanged. This preparation contract does not
authorize replacing `v0.2.7`, tagging or publishing.

### Revision3 preparation follow-up: retain the existing README warning

The first current Node20 control run passed25/27 and failed the two existing
host checks: the rewritten status removed the required early statement that
a version is not publication evidence, and its mandatory host mutation anchor.
Retain `v027-release-validation-62YqDx/report.json`, not a PASS or qualifying run.
Restore the exact existing English/Japanese warnings within the first1000
characters; do not weaken either assertion or change its mutation anchor.
The first violated condition is the existing documentation contract.
Actual Node24 targeted TEST-HOST-005 and TEST-RELQ-HOST-001 then passed2/2,
including real package-entry controls, in `v027-doc-notice-restored.log`.

Only the two root READMEs change; the118 canonical skill bytes/modes, reference
commit/tree, scope/content revisions3/3 and all required policies remain fixed.
The root-document change correctly invalidates the seven-artifact approval.
Retain the original approval event and require a new exact seven-artifact
human lock; no frozen candidate exists and qualification credit remains0.
The subsequent premature unit run `v027-release-validation-P6oZbV/report.json`
passed18/27 and rejected nine admission-dependent controls under that stale
lock. This is retained contract-bound rejection, not permission to repair the
lock automatically or repeat to PASS. New full controls/preflight must wait
for genuine renewed approval. The previous registration-only preflight
`qualification-v027-linux-r4-preflight-UoBCgS` discovered1182 required names
including the new oracle regression; it grants no credit to changed artifacts.
The earlier Node24 archive/npm feasibility hashes identify their historical
checkpoint, not the package after this root-document correction.

## Stable0.2.10 successor: current preparation contract

The user requested main commit/push and npm publication on2026-11-11, then
explicitly selected0.2.10 release-preparation changes and validation.
Main337ad8f contains the previously merged #386/#387 and proofreading work;
the separate0.2.9 branch is not merged. Publication is not yet authorized for
an exact artifact. Preserve the old0.2.8 contracts, genuine approvals, failed
runs and all historical evidence unchanged.
The proofreading payload entered main through existing551228c and PR388,
not through5917e42. Only the latter's additional release-catalogue definitions
are prospective prior art for this preparation; neither its helper changes,
human approval nor evidence is already merged or credited. Both qualifying
runs must execute the final0.2.10 successor candidate, never either ancestor.

The exact new human preparation unit is this specification,
`.sdd/release-validation.v0.2.10.json`,
`.sdd/release-content-mutations.v0.2.10.json`,
`.sdd/specs/claude-code-support.md`, README.md, README-ja.md and CLANGELOG.md.
Scope/content revision1 names its exact0.2.8 predecessor hashes and the
separately committed5917e42 development catalogue as explicit prior art, not
transferred approval. All24 required Linux cells, exclusions, commands,
unchanged budgets, original13 semantic mechanisms,14 placeholder mechanisms,
118 source paths/full modes,1180 source challenges and60 origin sensitivities
remain mandatory. Add the15 already specified contextual-proofreading
mechanisms:28 semantic plus1240 vendor cases =1268 SKILL-MUTATION cases.
Required current regression discovery includes all #386/#387 cases.
No existing case, assertion oracle, environment or budget is removed or
weakened. Missing, skipped, setup-error or unknown evidence cannot pass.
Preparation approval precedes the production cutover and native successor
checks; it does not require or authorize a prematurely frozen candidate.
Only after that approved implementation, current proof and a final clean
commit may the launcher freeze the candidate and count fresh runs.

Independent source reference337ad8f, skill tree
`98052db3fb78bce20f14dc9b038f175094ed7dc4`, is prospective, not frozen.
The retained preparation report `v0210-release-reference-report.json`
compares all118 committed Git blobs, permission-preserving archive and actual
offline npm package bytes/modes, then initializes source/package on both
hosts (Copilot118/Claude115) using actual Node24.22.1. Twenty canonical byte
digests differ from the old0.2.8 reference; no path or mode changes.
The report's exact source/tree identities and hashes must be checked before
approval; no comparator failure or mutant result may repair the reference.
This is feasibility only: no Node20/22 qualification, native adapter Green,
full fresh-root gate, frozen run or approved publication tgz is claimed.

### Design of the cutover

After genuine approval, retarget only the release launcher/cells/content
reference/default receipt checks to stable0.2.10. Preserve the actual0.2.10
host regression; its current version behavior is already implemented, so
aligning the stale host specification is not a new metadata implementation
or a fabricated assertion Red. Actual old/prerelease package receipts must
still reject.

Reuse the reviewed0.2.9 catalogue mechanisms only where needed for the
already merged proofreading behavior: copy the trusted naturalness oracle,
select its exact owning test, preserve every primary Python assertion and
diagnostic fragment, and retain valid-input/baseline/restored controls.
The intentional missing-markdown_it child diagnostic is acceptable only
inside TEST-JAPROSE-005's exact owned assertion at line68, with the frozen
outline.py dependency declaration and otherwise clean execution. Wrong
module/script, stderr/setup events, foreign frame, malformed/extra native
events or a surviving mutant must reject. This does not generally accept
loader failures or relax another mutation's oracle.
The native regression must enumerate all finite witness subsets: for case22,
only {252} and {252,262} pass; {} and {262} reject. For case25, only
{283,296} and {283,296,305} pass; {}, {283}, {296}, {305}, {283,305} and
{296,305} reject. Add explicit wrong outline/terms script, markdown_it/ginza
module, owning test/frame and unowned stdout/stderr controls for case28,
including the positive exact owned child-failure case and successful
baseline/restoration. These are required planned tests, not executed evidence.
Derive these exact frames and expected fragments from the independently pinned
test_engine.py and naturalness-test blobs in337ad8f, not future mutant output.
The existing content comparator checks the oracle digest before execution.
A refactor, changed line, additional sub-check or diagnostic change requires
a reviewed successor reference, renewed exact-artifact human approval and
reset qualification; it must fail closed, never silently widen the frame set.

Keep the historical703a4fe seven-artifact CI fixture and its exact old
package metadata distinct from the new human-approved0.2.10 unit. Current
release regressions must consume the exact newly approved fixture revision
and committed source references, not mix live docs with old approval hashes
or silently synthesize production human approval. Historical controls may
materialize and execute their actual pinned historical helpers; they grant
the current candidate no qualification credit. Every current adapter still
requires the complete positive and negative regression controls.

Author the complete affected native TEST union and artifacts in the existing
implementation plan before production edits. Rebind changed specifications
and transitive task dependencies, retain old/failed receipts, and genuinely
verify each affected task. Freeze only the final clean committed candidate,
including the finalized cost snapshot; do not mutate owned cost inputs
after verification or during either run. Any relevant edit resets validation.
The existing checkFrozenCandidate and evaluateReadiness paths recheck frozen
file/tool/configuration digests and manifest/history bindings before accepting
each run or two-run streak; retain their exact manifests and process logs.

| REQ | PASS condition | Counterexample and expected verdict | TEST/command | Observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-RELQ-001`, `REQ-RELQ-002` | Complete genuine0.2.10 seven-artifact approval admits24 unchanged cells and118 committed byte/full-mode references | Old0.2.8/0.2.9 approval, stale suite hash, missing cell/path, changed mode or reduced budget: reject; exact current approved unit: accept | TEST-RELQ-001, TEST-RELQ-BASELINE-001, TEST-RELQ-CONTENT-ADMISSION-001, TEST-RELQ-LINEAGE-001 | Actual main admission FAIL: current suite306b6d5d differs from old a7148f0d. Independent Node24 Git/archive/npm/both-host inventory passed118/118; genuine approval/native successor controls pending |
| `REQ-RELQ-003` | All1268 skill cases retain exact named selection, required primary assertions/diagnostics and passing controls | For case22, observe collateral line262 but omit primary252: reject. For case25, omit either283 or296 while observing305: reject. For case28, wrong module/script/frame or unowned traceback: reject. Complete exact owned witnesses: accept | TEST-RELQ-SKILL-001, bounded isolated mutations of primary/diagnostic/origin acceptance; all frozen content cases | Prior5917e42 mechanisms are reviewed prior art only. No current assertion Red/Green, mutation or qualification credit yet |
| `REQ-RELQ-005` | Actual current package adapter installs exactly stable0.2.10 from the frozen tgz and retains all required runtime/host receipts | Receipt0.2.8,0.2.9 or0.2.10-dev.0, substituted archive/hash, missing actual entry point or repacked qualification origin: reject; exact current artifact: accept | TEST-RELQ-PACKAGE-BINDING-001, TEST-RELQ-005, TEST-HOST-005 and PACKAGE-20/22/24 | Current launcher/cells still hardcode0.2.8. Node24 preparation package/CLI/both-host inventory passed; successor assertion Red/Green and three-runtime package cells pending |
| `REQ-RELQ-004` | Same final candidate/manifest passes every required cell twice consecutively in fresh isolated state, then a separate exact-tgz human decision authorizes publication | Developer gate1203/1203, historical passes, partial run, changed cost/source/manifest, reused state or merely saying npm publish: no qualification/publication credit | Existing freeze/check/run/status, TEST-RELQ-004, TEST-RELQ-READINESS-001, TEST-RELQ-PUBLISH-001 | Credit0, no frozen0.2.10 manifest and no publication artifact approved |

All six first-failure stages apply: contract = exact new human preparation
unit and strict version/scope; trusted inputs = independently committed118
references, exact executable/dependency closure and archive identity;
execution = real native Red/Green, positive controls and every unchanged
budget in fresh state; verdict = reject stale/invalid/foreign evidence while
accepting valid controls; evidence history = immutable failures/predecessors,
zero inherited credit and reset on relevant edits; integration/distribution =
actual package on20/22/24 and both hosts, two full frozen runs, publishing
identity check without exposing credentials and separate exact-artifact human
release approval. No stage is waived.

The current GitHub record closes #385 by the maintainer's explicit
2026-11-07 non-reproduction disposition, not a root-cause fix or severity
downgrade. Retain the unidentified historical first failure and all diagnostic
history as residual risk. Do not silently convert old contract prose saying
it remains open into evidence of repair; show the current disposition and
the remaining uncertainty to the final approver. Any newly observed in-scope
S1/S2 or unclassified failure still blocks readiness. Existing developer-gate
human-implementation-drift/trace/stub warnings and incomplete root JavaScript
diagnostics remain disclosed; their developer verdict is not qualification.
Windows/macOS, WSL containers and live Claude interactions remain unqualified.
This specification and CLANGELOG.md carry the #385 disclosure inside the
seven-artifact unit; the final exact-package release report and approval
request must repeat it rather than reducing it to the issue's CLOSED label.

### Feedback-integrated successor: scope2/content2 preparation

The user explicitly resumed release work through the existing GitHub Actions
publication workflow after the feedback feature commit/push. This permits
preparation and validation, not unseen artifact approval or a local publish.
Source reference01e1f0d98c9e32f5a1cfa682435b09b4e54d6957, skill tree
`74a4b3296575f2eba31483987e5d164bc307da0e`, contains the feedback feature.
The preceding scope1/content1 descriptions remain historical preparation.

The old inventory correctly rejected the two newly shipped helper/test
paths. Scope/content revision2 preserves every old118 path/full mode,
all24 required Linux cells, exclusions, unchanged budgets,28 semantic
mechanisms,14 placeholder mechanisms, nine source permission-bit policies
plus byte policy and all60 origin sensitivities. Renew exactly8 intended
canonical byte digests; add
`.github/skills/lean-sdd-tdd/scripts/implementation-feedback.mjs` and
`.github/skills/lean-sdd-tdd/scripts/implementation-feedback.test.mjs`.
Each added file receives all10 source byte/full-mode challenges, not an
exception:120 source files,1200 source challenges,1260 total vendor/origin
challenges and1288 total SKILL-MUTATION cases. Copilot owns120 files and
Claude117; the existing three-file watchdog exclusion is unchanged.
No prior case, primary assertion, diagnostic, mode or valid control is
removed or weakened. The two new source modes are0664/package0644.

Revision1 hashes are retained explicitly:
scope `fce4b43abb229843e0dd246534c10f7bf70321a3ab899b0461986105278f11bf`
and content `4f39011db146f92e32aeb54a161781f1643ee9121fe78c88f0c3f5e53c8ee7d2`.
Prospective revision2 hashes are:
scope `4d91abf448412004f8b98d51c412d49e6d0115e0359a240bddd4641c2a6284d9`
and content `9019a5968859179375d61897fb86abef07f57aeb2dad0e9858bb879378c93f40`.
Keep their exact reasons/predecessor identities and zero streak/credit.

The independent preparation report
`v0210-feedback-inventory-reference-report-02.json`, SHA256
`b0d94b2642d54754b7f385b9f9b00fb5c7278f8077a47b85f898c33fc7d83865`,
compared all120 committed blobs, live/full archive modes, actual offline
npm package bytes/modes and source/package initialization on both hosts.
All four host inventories passed120/117. The development tgz SHA256
`3fa72ea5534e583a87b7ccff19ad77f5d282e783afbd68232d2ce4d9dbead3ae`
is preparation-only, not the final frozen/publication artifact.
The comparator rejected an initially unaccounted current-oracle hash change,
then rejected an overbroad guard that reached historical provenance. The
corrected explicit renewal touches only current oracle evidence for the
already reviewed shared legacy-fixture opt-out:
SDK test SHA306b6d5d becomes b0810139; historicalEvidence SHA0e5b1285 and
every mechanism/edit/primary assertion/diagnostic remain unchanged.
Both failed attempts and command records are retained, never Red or run credit.
The unchanged raw report
`v0210-feedback-inventory-reference-report.json`, SHA256
`6faeb7c9d0bb63f0bb768a2ae1681ef023e07f6e8c4d4094becd430b59f1e7bb`,
retains those actual commands. Report02 is a metadata-only supplement after
independent review corrected two inherited count descriptions to120/1200;
its predecessor draft hashes are retained. No source/policy, primary assertion
or command result changed, and no comparator/command rerun is attributed to
that supplement.

After genuine renewal of the same seven-artifact preparation unit, extend
only the current content-catalogue adapter's fixed policy for stable0.2.10
revision2. Preserve revision1's118/1268 fixture behavior; revision2 requires
exactly120/1288 and every old case plus exactly20 new source challenges.
Unsupported current-version revisions and missing/extra files, stale counts,
duplicate IDs or omitted new-path policies must reject. Do not derive the
required count from whatever inventory the input happens to supply.
First extend the existing native regression, obtain its actual assertion
Red against the old118 guard, then implement the bounded policy and prove
Green, valid legacy/current controls and isolated restored sensitivities.
The genuine seven-artifact preparation approval was recorded by nahisaho
before adapter cutover; it did not approve publication. The bounded adapter
now accepts the valid revision2 catalogue and rejects the declared invalid
inputs. These are development-stage results, not a complete content-cell run.

| REQ | PASS condition | Counterexample and expected verdict | TEST/command | Observed evidence |
|---|---|---|---|---|
| `REQ-RELQ-001`, `REQ-RELQ-002` | Exact new seven-artifact approval binds120 committed paths/full modes, unchanged24-cell scope and current lineage | Old human lock or scope/content1,119/121 files, stale byte/mode/lineage or weaker budget: reject; exact new approved unit: accept | Independent Git/archive/npm/both-host comparator; TEST-RELQ-BASELINE-001 and TEST-RELQ-CONTENT-ADMISSION-001 |120/120 inventory and four host origins passed; genuine preparation approval recorded before implementation; full development validation/frozen admission pending, and this evidence update requires a renewed exact preparation lock |
| `REQ-RELQ-003`, `REQ-RELQ-005` | Legacy revision1 yields1268 named skill cases; revision2 yields1288, preserving every legacy ID and adding exactly the20 declared new-file/policy combinations; placeholder catalogue remains14 | Treat revision2 as118 files, drop or substitute either new file at unchanged120 cardinality, omit a policy, duplicate a row, keep old1268 counts or use an unsupported revision: reject; both valid controls accept | TEST-RELQ-SKILL-001; actual native Red/Green, final eight isolated restored mutations and complete release/host modules | Initial native assertion Red/Green and independently found substitution Red/Green passed; final29/29 complete controls, JS47/47 ignored0 and eight assertion-detected/restored sensitivities passed; no complete content-cell claim |
| `REQ-RELQ-003` | Git-free discovery does not construct pinned execution fixtures; selected execution without history rejects | Eager fixture reads fail discovery; fallback/suppressed reads hide genuine missing history | Existing TEST-CI-FIXTURE-001 and CODE-CI-FIXTURE-004 | Genuine current native Red/Green, eager-read mutation and exact restoration;26/26 affected controls, six exact-source Node20/22/24 controls and JS47/47 passed. Independent implementation reviews clean twice; affected-task/full-gate validation still pending |
| `REQ-RELQ-004`, `REQ-RELQ-005` | Two fresh complete identical frozen runs precede separate human approval of the exact Actions-compatible tgz; only the approved annotated tag triggers publication | Prior1211-test development gate, subset/native controls, a new hash or broad npm request cannot authorize readiness/publication | Existing freeze/check/run/status and publication workflow | Qualification credit0; no final artifact, tag or publication |

Actual adapter-stage evidence is byte-exact in
`.sdd/evidence/v0210-feedback-catalogue/provenance.json` and its30 copied
outputs. The private proposed-policy spike ran one native test, passed one
and skipped zero without modifying live source; it predates the subsequent
substitution hardening and is not the final source or live Green.
`tdd red TEST-RELQ-SKILL-001 --retest ...` produced the initial approved120-file
assertion failure in `native-red-02.log`, followed by genuine native Green.
Independent review then found that replacing either required path with a
different unique path retained120 entries and bypassed the count guard.
Both concrete substitution regressions were added before the second fix;
`native-red-03.log` records Missing expected exception, and
`native-green-02.log` records genuine Green after explicitly requiring both
declared paths. This closes a contract-stage failure, not a scope expansion.

The final selected regression enumerates24 unsupported-revision combinations
(six invalid values, both legacy/current payload shapes and both cells),
both missing paths, both cardinality-preserving substitutions, extra and
duplicate paths, stale counts, duplicate/replaced policies and each of the
nine omitted bits. Valid1268/1288 and unchanged14-placeholder controls accept.
Final isolated mutations each independently removed or violated one guard:
valid120 rejection, revision fallback, file cardinality, count binding,
policy-name set, case-ID uniqueness, new-file case generation and required
path presence. Each produced one actual native assertion failure, then
byte/mode restoration and one passing native control with zero skips.
`mutations/summary.json` retains all eight results and source identity.
`affected-suites-02.log` records29/29 complete release/host tests, zero
failures/skips; `diagnostics-02.json` records actual ESLint47/47, ignored0.
These bounded examples and eight mutations are not exhaustive arbitrary
input, hostile-host or full1288-case qualification proof.

The actual preimplementation consistency check returned1, not PASS: eight
affected old receipt heads required revalidation after the genuine canonical
specification changes. Its read-only binding preview had128 known current
fingerprints and eight measured replacements, with no unknown inputs; those
bindings were adopted without clearing history-head pointers. The other120
task histories remained current. Both actual outputs are retained; neither
binding renewal nor old completion status is task verification. Fresh
affected-task verification, the current full development gate and two frozen
complete clean runs remain pending. Record those later stage outputs without
claiming they ran here or repeatedly changing this native-stage observation.

All six first-failure stages apply: contract=the newly advertised two-file
scope needs this explicit prospective revision, not an inventory exception;
trusted inputs=committed blobs/full modes, current-only oracle identity and
separate historical provenance; execution=real native assertion Red/Green,
restored mutations and all unchanged per-cell budgets; verdict=accept both
valid revisions and reject every declared invalid row; evidence history=keep
failed attempts/predecessors, reset on each relevant edit and transfer no
credit; integration/distribution=actual20/22/24 package/host cells, fresh-root
task proof/full gate, two fixed clean runs and separate exact-package approval.
No stage is waived. Root JS diagnostics are now complete47/47; earlier
incomplete observations are historical. The baseline01e1f0d development gate
was1211/1211 with128 current tasks, not proof for these subsequent changes.
Keep #385's non-reproduction disposition, warnings and unqualified-platform
limits disclosed above. This amendment and CLANGELOG.md require renewed
human preparation approval before adapter cutover; no approval is synthesized.

### Lossless-ledger successor: scope3/content3 preparation

The prospective committed source is
`ffff1a7893a41d9b8ea0b50ddc4837a663ce23a3`, skill tree
`7b8748289a38568f37f697afe0b6ba9dcd07b864`. Keep every revision2 path,
full mode, semantic/placeholder mechanism, historical mapping, budget and
all24 required Linux cells. Renew exactly four canonical byte references:
the SDD guide, planning CLI, standalone SDK and its existing regression file.
Add only the shipped `tdd-ledger.test.mjs`, with all ten source byte/nine-bit
permission challenges. This gives121 canonical files, Copilot121/Claude118,
1210 source challenges,60 origin sensitivities,28 semantic mechanisms and
1298 required SKILL-MUTATION cases; all14 placeholder mechanisms remain.
The current SKILL-REPLACEMENT-13 SDK-test oracle identity changes from
`b0810139e648802f6c2e59d4f1ad435612f6a1f96903a9ff3948cf150830c86a`
to `5bf8c282f28eded3aaa58c90a83319e4dddd957c6461d33f2a5cd7740822f644`;
no historicalEvidence, mutation edit, primary assertion or diagnostic changes.

The independent `v0210-compaction-inventory-reference-report.json`
compared committed blobs, live/full archive modes, actual offline npm
bytes/modes and source/package initialization on both hosts: all121 paths
and all four121/118 host inventories passed. It is preparation evidence,
not the final tgz or a qualification run. Prospective scope SHA256 is
`2f8999a87402f312a72476f96284a4395a0fbcef157fccfeeb991ddc4ad99102`;
content SHA256 is
`fe50d0aafd3d912eb4be1fa088fefae64dc84a74bf10d3862daad30b91686d2e`.
Their revision2 predecessors remain explicitly bound and retained in Git.
Require renewed exact seven-artifact human preparation approval before
adapter cutover/admission, independently of final publication approval.

The retained frozen run-h5n6Bp passed14/24 cells, then ORACLE-SELFTEST failed
because selected TEST-RELQ-003 executes genuine pinned `git show` fixtures
in a Git-free materialized source. Discovery itself correctly remains
Git-free. The already bound genuine history must also be restored for the
`oracle` execution kind, using the same digest, private clone, exact commit
and frozen overlay checks as `gate`/`suite`. Never fake history, suppress
selected-fixture failures or attach Git metadata to discovery or other
Git-free kinds. A zero-credit isolated execution using the existing genuine
bound bundle passed the selected test1/1; this is feasibility, not Green.

| REQ | PASS condition | Counterexample and expected verdict | TEST/command | Observed evidence |
|---|---|---|---|---|
| `REQ-RELQ-002`, `REQ-RELQ-003` | All three gate/suite/oracle execution kinds restore exact genuine bound history and frozen bytes; all ten other policy/discovery kinds stay Git-free whether history is supplied or absent | An oracle source without `.git` cannot execute its pinned historical fixture and must not pass; missing/partial history, wrong digest/commit or a contaminated frozen source rejects before successful execution; valid genuine history accepts | Extend existing TEST-RELQ-GIT-001 before implementation; enumerate the13 finite kind rows, nine missing/partial inputs for each history-using kind and existing digest/commit/overlay boundaries | Retained actual frozen14/24 failure and genuine-bundle selected003 spike1/1; native Red/Green and bounded restored sensitivities remain required |
| `REQ-RELQ-003`, `REQ-RELQ-005` | Valid revisions1/2/3 yield1268/1288/1298 unique skill cases, respectively; revision3 preserves all1288 predecessor IDs and adds exactly the ten ledger-file/policy combinations; all14 placeholder cases remain | Unsupported revision4 or nonnumeric/missing revision,120/122 files, stale1288 counts, duplicate policies/IDs, omitted permission bit, or substituting any of the three post-legacy required paths at unchanged121 cardinality rejects; all three valid controls accept | Extend existing TEST-RELQ-SKILL-001 before implementation; retain revision2 controls from committedffff1a7; enumerate unsupported values across all three payloads and both cells, every new policy and every missing bit | Independent121-file/four-origin preparation passed; actual native Red/Green and isolated invalid/valid sensitivity checks remain required |
| `REQ-RELQ-001`, `REQ-RELQ-004`, `REQ-RELQ-005` | Unchanged24-cell budgets/policies, current native task proof/full gate and two complete clean identical frozen runs precede separate exact-tgz publication approval | Old1225-test gate, Windows development CI, a partial run, scope/content revision2 or a broad publish request cannot transfer credit or authorize tagging | Existing native plan verification, full gate, freeze/check/run/status and annotated-tag workflow | Windows43236541000 passed all Node20/22/24 source/both-host/standalone jobs atffff1a7; current full gate and frozen streak remain unproven,0/2 |

First violated stages: contract = explicit121-file revision and genuine
seven-artifact approval; trusted inputs = exact committed bytes/full modes,
bundle digest and commit; execution = the observed oracle omission of an
already bound required historical input; verdict = accept all valid revisions
and history controls while rejecting invalid evidence; evidence history =
retain failed run-h5n6Bp and predecessors, reset0/2 with no credit; integration/
distribution = real both-host/runtime cells and separately approved exact
Actions-compatible tgz. All six apply; none is waived. Unsupported native
permissions, macOS, full Windows qualification, WSL and live Claude remain
outside qualified Linux support; #385's unidentified historical first
failure remains disclosed. Later native/mutation/gate records belong in the
existing feature review and authentic receipts, not an assumed PASS here.

### Explicit lexical-oracle selection after the scope3 frozen failure

Frozen manifest
`eea479bc8ed2ee16b2e3ca6ae8c88947f8e3038b54e7af84fe62458f729776ee`,
candidate `9d45e5be1c3eccc57664d9bbfd1c0b5f8ea957ec`, run-yCeDHE
passed16 cells, failed SKILL-MUTATION and left7 cells unrun. The retained
adapter stdout reports a path argument of type Array. `nodeNames` requires
`source, file, prefixes`, but both `lexicalControls` and the final
`validateContentRun` phase supply only source and the prefix array.
This is an execution-stage selector defect, not evidence that
any of the1298 named mutations passed or failed. Preserve the failed run;
the complete-clean streak remains0/2.

| REQ | PASS condition | Counterexample and expected verdict | TEST/command | Observed evidence |
|---|---|---|---|---|
| `REQ-RELQ-003`, `REQ-RELQ-005` | Both lexical execution and final validation explicitly select `scripts/kotonoha-skills.test.mjs` and require exactly TEST-TW-PH-001/002/003 under source and extracted-package origins, with three native passes and zero failures/skips per origin | Omitting the file argument at either call passes the prefix Array to path.join and must fail the regression; wrong oracle file, missing/duplicate/reordered origins, changed argv/source or wrong target names must reject. The unchanged actual source/package controls must pass | TEST-RELQ-LEXICAL-001; actual runContentCell integration stopped at a deliberately occupied first named-case directory only after all13 inventory controls and both lexical controls; independently inspect both native receipts and exact names, then directly exercise the unchanged lexical-verdict phase extracted for reuse by validateContentRun | Frozen run retained; actual pre-lock assertion failure after5652ms confirms the execution omission. Formal native Red/Green and separately restored execution/verdict selector mutations remain required |
| `REQ-RELQ-001`, `REQ-RELQ-004` | Keep all24 cells,1298 skill cases,14 placeholder cases, all origin controls and original budgets; require two new complete clean runs after relevant changes | Reusing16 partial passes, treating the deliberately stopped regression as a full cell, skipping lexical controls, weakening ownership checks or starting run2 after this failed candidate must reject | Existing freeze/check/run/status and native ownership validators | No complete run or publication credit |

First violated stages: contract = retain the already required lexical rows
without narrowing policy; trusted inputs = explicit independently hashed
oracle file and exact frozen package; execution = the missing filename
argument observed above; verdict = exact native names/counts/ownership and
valid controls, not arbitrary failure; evidence history = retain the failed
candidate and partial results, reset0/2, no component-test credit transfer;
integration/distribution = actual source/extracted-package controls followed
by the complete matrix and separate exact-artifact publication approval.
All six stages apply; none is waived. Renew the same exact seven-artifact
human preparation unit before production repair or a successor freeze.

## Risks / assumptions
Six first-failure stages: contract — approved Linux scope and exact inherited 24-cell equality; trusted inputs — pin actual files/tools/configuration and reject absent dependencies; execution — fresh isolated work, bounded commands, real native controls; verdict — independent named catalogues, positive controls and assertion mutants; evidence history — immutable failed records, no old credit, deterministic streak reset; integration/distribution — exact tgz and both-host inventories on Node20/22/24, separate human approval.
Replacement first-failure classification: contract — missing original edits/seven path identities require this explicit approved replacement; trusted inputs — approved committed-byte references, origin-specific exact modes and real interpreter/dependency identities; execution — permission/import/timeout failures are not kills; verdict — exact native assertion/argv/receipt and valid controls, not arbitrary failure; evidence history — no historical or spike credit and reset on any relevant revision; integration/distribution — real source/init/extracted-package fixed lexical and inventory controls. All six stages apply; none is waived.
Oracle: docs/design-sdd-hardening.md section 3.5; inherited .sdd/release-validation.v0.2.0.json SHA256 e2f221e308e2fb4389f044e12c42cb2083e314b97305ae1701f65cd399c37de6. Removing NATIVE-WSLC is the only requested required-cell reduction and requires exact-artifact human approval before qualification. The genuine scope-approval event is retained by the host; machine tests do not attest human identity or simulate successful release authorization.
Preflight: current host is Linux 7.0.0-27-generic with no Windows mount or WSL executable. Official SHA-verified Node20.20.2, Node22.23.3 and Gradle8.14.3 have been provisioned; Node24.22.1 and the earlier full-gate native tools are available. No SSH/runner details were supplied; qualification proceeds on this Linux host only.
