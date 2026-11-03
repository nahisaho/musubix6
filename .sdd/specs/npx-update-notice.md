---
feature: npx-update-notice
tier: T1
---
# Version-neutral npx update documentation regression
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-HOST-NPX-001 (test-only) | When checking either README's npx update section, the regression shall require the npm current-tag warning that @latest can differ from source version 0.2.7 without requiring any particular historical published version, and retain all existing stable-metadata, availability, packaging, executable-bit and wrapper checks, including under umask 0077. | TEST-HOST-005 |
## PASS conditions and counterexamples
| REQ | PASS condition | Counterexample | TEST/command | Observed evidence |
| `REQ-HOST-NPX-001` | Both current README update sections pass; each locale's absent current-tag or divergence warning fails; real npm archive, exact executable bits and both-host installation checks still execute and pass under umask 0077. | Correct English/Japanese text with no 0.1.4 must pass; removing either locale's current-tag statement or warning that latest differs from 0.2.7 must assertion-fail; extracting without permission preservation under 0077 must expose the inventory mismatch. | TEST-HOST-005; isolated README/extraction mutations | Earlier correction evidence is historical. Fresh version-bound assertion Red/Green and bounded sensitivities for0.2.7 remain pending; no publication or qualification claim follows from a documentation check. |
Oracle: `REQ-HOST-005` in claude-code-support, subject to current human reapproval for0.2.7, and the README's existing publication-check policy; npm dist-tags are mutable and do not imply a fixed historical release. This oracle update does not itself authorize production metadata or README changes, or any release action.
Risk stages: contract — preserve approved publication/qualification disclaimers, remove only the obsolete 0.1.4 literal; trusted inputs — inspect both local READMEs and use isolated fixture mutations; execution — real npm pack, extraction and host installs; verdict — invalid warnings rejected and correct warnings accepted, not a passing empty check; evidence history — retain prior Red and record fresh corrected-oracle Red/Green; integration/distribution — preserve existing packed assets and list/sdd forwarding checks.
Scope: test-oracle maintenance only, no production behavior, documentation rewrite, version bump or publication. The older GiNZA full gate was stopped before this new delta, so its interrupted result cannot validate the new tree.
Execution detail: use tar -p for this locally produced archive so inventory observes archived permissions rather than caller umask; do not weaken mode comparison or chmod the expected source tree. Terminating the old gate launcher left detached npm test workers alive; the four specifically identified owned PIDs were stopped and only their inspected .sdd-test-work-swuLHM fixture directory removed before refreshing evidence.
## Evidence and limits
Evidence root E: `/home/nahisaho/.copilot/session-state/1f3fca45-165b-46a5-a9cb-f50f07eb054e/files`. `node E/npx-notice-mutations.mjs` rejects 7/7 isolated invalid cases: both locales' missing tag, missing divergence and split-paragraph warning, plus non-preserving extraction under 0077. Four valid historical-version controls and all 11 byte-restored controls pass; the baseline contains no historical release literal. Results and per-case logs: `npx-notice-mutation-results.json`, `npx-*.log`. No mutated README persists.
`node --test scripts/host-compatibility.test.mjs scripts/kotonoha-skills.test.mjs`: 12/12 pass, zero failures/skips/TODOs; this includes the GiNZA real-runtime test and real npm packaging. `gate --changed --no-run`: trace has 82 REQs, zero errors and 6 existing warnings; ledger 488 entries intact; changed-scope evidence 12/12 Red→Green. Exit 2/INCOMPLETE is intentional because project commands were not rerun by this preflight; it is not a full-gate PASS. The interrupted broad gate has no completion claim.
JavaScript diagnostics remain INCOMPLETE because this checkout has no root ESLint flat config. No unrelated lint configuration or required-test narrowing was added. The original human-approved claude-code-support spec/approval remains byte-identical.
2026-10-29: the preceding evidence describes the original 0.2.0 fix. The user now selected the separate 0.2.3 release preparation; only the source-version oracle advances here, alongside explicit human reapproval of the version-bound host contract. Fresh assertion Red/Green and mutation controls are required; old evidence grants no 0.2.3 qualification.

2026-10-30: the user selected 0.2.4 instead of the unpublished 0.2.3 candidate. Only the current source-version oracle advances; keep normal installation on @latest, require explicit availability checks for pinned 0.2.4, and retain all warnings and package controls. Earlier scope/qualification evidence does not transfer.

v0.2.7 preparation advances only the chosen source-version oracle alongside the separately human-locked host contract. Keep both locales' current-tag/divergence notices, pinned-version availability checks, umask0077 permission-preserving extraction and actual payload/wrapper controls. Project metadata and user-facing instructions remain unchanged until the host manifest is approved and the updated regression first assertion-fails; no prior evidence transfers as a new-version Green or release qualification.

## v0.2.7 execution evidence

The preceding pending statements describe the preparation baseline, not the
outcome below. Genuine `ask_user` approval covered the exact prepared host
specification SHA256 `4f61a0a55156505d3658907a5b8dd0c8b8e3eeb316f6723089f6501c16ee5d14`
and the displayed coupled oracle/test paths and hashes, for candidate preparation
only. That human-locked specification remains unchanged.

`tdd red TEST-HOST-005 --retest "Human-approved stable0.2.7 version requirement supersedes0.2.6; preserve lock/docs/pack/host/wrapper controls"`
recorded the expected assertion failure before `npm version 0.2.7 --no-git-tag-version --ignore-scripts`
and the README/changelog updates. `tdd green TEST-HOST-005` then passed.

Session `28b37d8f/files/v027-version-validation-l034Gm/report.json` records actual
Node20.20.2/22.23.3/24.22.1, each five host tests passed with zero skips, plus
18/18 isolated assertion-detected mutations, exact restoration and successful
valid controls: old/prerelease root versions, each lock identity independently,
the packed CLI, candidate heading and each locale's source version, availability,
npx availability, current-tag/divergence warning and publication disclaimer.
Changed-test isolated JavaScript diagnostics passed; this is not whole-project lint.

Session `28b37d8f/files/v027-version-prose-LZrE4z/` records the changed Japanese
paragraphs' full GiNZA prose/reading-load/outline/terminology pass, score100 to100,
zero prose/load findings, six reviewed terms and a byte-identical whole-file
invariant against the post-required-version-edit original. No optional prose
rewrite was needed. Both whole-README structural lints retain exactly16 baseline
flags each with no new flags; the new atomic changelog entry has zero flags.

Limits: mutations ran on Linux/Node24 and exercise bounded lexical/metadata
oracles, not general publication-claim semantics. No new-version integrated full
gate or frozen qualification is established. Checkpoint CI `41730888446` failed
on the Git-diagnostic oracle and release-policy fixture admission; its Windows
development control `41730888352` passed on the older checkpoint only. Keep those
failures and zero release credit; main integration, tagging and npm publication
remain unauthorized by this preparation approval.
