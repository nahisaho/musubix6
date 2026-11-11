# Changelog

User-facing changes to musubix6, with upgrade guidance and known release limitations.
Release dates use Japan Standard Time (UTC+09:00).

## [0.2.10] - Candidate prepared 2026-11-11

Source candidate for #386 and #387, based on the committed v0.2.8 source.
Uncommitted v0.2.9 work is not included. No tag or npm publication is implied;
full-project validation, frozen qualification and publication approval remain
separate requirements.

### Implementation feedback and upgrade

- Require each implementation batch to update the existing canonical
  requirements/design impact and change notes, including no-requirement-change
  decisions; do not create a competing specification.
- Enable CLI feedback enforcement for newly initialized planning-enabled
  projects. After review/approval and native validation, use
  `sdd feedback record FEATURE` to accept the current implementation/spec
  identity. Missing or stale acceptance blocks task verification and gates,
  not Red/Green. Existing projects stay opted out unless they explicitly set
  `"specFeedback":{"required":true}`; enabled feedback requires planning.
- Preserve ownership transfers and accepted history, and distribute the same
  workflow and helpers to both supported agent hosts. Recording feedback is
  not a substitute for tests, task verification or release approval.

### Release preparation

- The feedback development baseline passed its full gate (1211 tests,
  zero failures/skips) and all128 task checks. Subsequent release-fixture and
  inventory changes require fresh affected-task and full-project validation;
  baseline results are not current frozen qualification.
- The prospective scope/content revision2 retains the24 required Linux cells,
  unchanged budgets, every inherited file/full mode and mutation. It covers
  120 canonical skill files,28 semantic mechanisms,1200 source byte/mode
  challenges and60 origin sensitivities:1288 required skill cases.
- Old release contracts and failed history are retained. The new exact
  seven-artifact preparation approval, fresh native proof, two identical
  complete frozen runs and separate exact-package publication approval remain
  required. No package is published by this preparation entry.
- #385 was closed by the maintainer's explicit non-reproduction disposition,
  not a demonstrated root-cause fix. Its unidentified historical first
  failure remains a disclosed residual risk. Windows/macOS, WSL containers
  and live Claude interactions remain outside qualified support.

### Fixed

- Return exit0 for explicit SDD help without reading project inputs, and list
  diagnostics plus plan check, verify and bindings; invalid usage still exits2.
- Defer historical release-test fixtures until selected execution so Git-free
  discovery works without giving missing-history execution a fallback.

### Added

- Preview specification/dependency hash bindings with `sdd plan bindings --json`
  without executing checks or writing files. Output includes effective
  prerequisites, known/null fingerprints, retained history and a binding-only
  RFC6902 patch. Review and apply it explicitly, then check and freshly verify.
  A preview is not completion evidence; unknown inputs remain incomplete,
  malformed histories refuse, and strict check/gate/verify policy is unchanged.

## [0.2.8] - Candidate prepared 2026-11-05

Development preparation only: metadata cutover, full-project checks, frozen
qualification and separate publication approval remain outstanding.

### Breaking changes and upgrade

- Require JSON implementation planning by default, including existing projects
  with omitted configuration/planning/required fields. Provide a current
  full-scope `.sdd/implementation-plan.json`, or explicitly set
  `"planning":{"required":false}` to retain the legacy workflow. New initialization
  writes true; existing configuration bytes and runner/check settings are preserved.

### Fixed

- Prioritize real failed-check records over passing test titles containing failure
  words, and bound diagnostic line lengths.
- Retain separate captured stdout/stderr and outcome/hash receipts for every gate
  check attempt, including fallback and retry. Local logs are ignored by Git;
  storage errors fail explicitly and a successful retry does not erase the failure.
  Existing capture limits apply; Windows inherits directory ACLs.

### Validation and limitations

- New observability regressions have native assertion Red/Green evidence and five
  isolated fault detections with restored controls. Planning-default checks and
  isolated default-policy mutations also pass.
- The original intermittent assertion in #385 remains unidentified. Observability
  repair is not proof of its resolution; no old v0.2.7 exception or qualification
  credit transfers to this candidate.
- Current full-scope task verification, exact-artifact preparation approval, full
  native gate, hosted checks and two identical clean 24-cell Linux runs remain required.

## [0.2.7] - Candidate prepared 2026-11-04

Status checked **2026-11-05 at 05:50 JST**: npm does not yet list 0.2.7.
The [publication workflow](https://github.com/nahisaho/musubix6/actions/runs/41898861716)
failed `TEST-DIAGCLI-CLOSE-001`; its publish job was skipped. Earlier clean
qualification runs and human approval apply only to the unchanged existing
tag, not this repair, and do not establish current release readiness.
Version 0.2.7 is retained and the existing tag is unchanged. Requalification
and new exact-artifact human approval are required before replacing that tag
and publishing. The candidate-preparation date above is not a publication date.
Confirm npm availability with `npm view musubix6@0.2.7 version`.
The repair is not in the tagged commit `7b18615`. At this repair checkpoint,
the full gate is blocked by a stale release-qualification artifact lock.
Fresh canonical references and human preparation approval are required
before successor qualification, separately from publication approval.

No existing CLI command or minimum-runtime requirement is removed.
Implementation planning remains disabled unless explicitly enabled.

### Added

- Add opt-in JSON implementation plans with specification and requirement
  coverage, task dependencies and current-input fingerprints.
- Track transitive stale inputs and verify tasks against native TDD evidence
  and required checks, retaining successful and failed verification receipts.
- Extend context and scoped/full gates with task ownership and prerequisite
  closure while preserving existing behavior when planning is disabled.
- Document plan authoring, explicit receipt adoption, progress updates and
  stale-input recovery in the four development roles and both READMEs.

### Fixed

- Recognize zombie/dead Linux states `Z`, `X` and `x` in the shared test-only
  owned-descendant probe. Read the state after the final command-name delimiter
  so names containing terminal-looking text cannot hide a live process.
  Keep production diagnostics, cleanup assertions and time limits unchanged.
- Let normal core and wrapper CLI dispatch finish through Node's natural
  shutdown while preserving returned exit statuses, avoiding a forced-exit
  deadlock observed on Node 24. Early-abort and refusal exits remain unchanged.
- Restore digest-bound private Git history for executed frozen regression
  suites, so tests can archive the approved historical source; keep
  registration-only discovery Git-free.
- Include the Windows native-runner/provenance, Rust stub-confidence and
  host-specific instruction fixes described in the unpublished 0.2.6 and
  0.2.5 entries below.

### Upgrade

Check `npm view musubix6@0.2.7 version` before installing the exact version;
`@latest` may point elsewhere. Back up local skill edits and follow the
host-specific README update steps to refresh copied skills with `init --force`.
Updating the CLI alone does not refresh existing project skill copies.

Planning does not rewrite the authored JSON. After successful task verification,
explicitly adopt the returned current successful receipt and update task status.
Projects that do not enable planning retain the existing workflow.

### Validation and limitations

- Pass the full native gate and two consecutive unchanged 24-cell Linux
  x86_64 qualification runs (`run-Lo02Jd`, `run-sWewCX`), each with fresh
  source, HOME and cache directories and all 24 required cells passing.
  Earlier versions' evidence contributes no qualification credit.
- Bind qualification to commit
  `7b18615577e74d785241e668cbb0b407c239d06e` and frozen manifest SHA-256
  `f8dae968dc12412dc174241be70657992e7c8d31e7618c0a4b0a95bc3787c351`.
  The approved npm package SHA-256 is
  `c068949417b8ae62b568705fbd219fece25e25690e2054218fca4cacf8363930`;
  the tag-triggered workflow must verify that hash before publication.
  These results are retained as history after the hosted failure and do not
  qualify the repaired candidate or later documentation/source changes.
- Pass the repaired six-test family on Node 20/22/24, detect 36 isolated
  helper mutations with 39 baseline/restored controls, and pass 36 bounded
  repeated real-process invocations. These are development checks, not fresh
  release qualification; they cannot prove every schedule.
- Pass Linux and Windows development CI on Node 20/22/24 and an authenticated
  npm dry-run. Windows controls do not establish qualified Windows release
  support; macOS, actual WSL containers and live Claude interactions remain
  unverified.
- Disclose nine trace warnings, five approval/code-drift warnings and two
  historical stub markers from the full gate. The shutdown regression checks
  declared JavaScript exit boundaries, not all VM-internal hang mechanisms.
- Keep publication separate from technical readiness: the earlier approval
  does not cover changed bytes. Fresh qualification, new exact-artifact human
  approval, actual publication, registry artifact bytes and provenance remain
  outstanding.

## [0.2.6] - Candidate prepared 2026-11-02

This entry describes the prepared candidate, not its publication status or
release date. Check npm availability and the GitHub release record before
installing this exact version. No CLI option or minimum-runtime changes.

### Fixed

- Resolve Windows native executable extensions without selecting the
  extensionless POSIX npm shim. Launch standard `npm.cmd` and `npx.cmd`
  through their JavaScript entry points with SDD's Node runtime, without
  introducing an implicit shell.
- Preserve Windows MSVC `INCLUDE`, `LIB` and `LIBPATH` while keeping inherited
  runner overrides blocked. Bind these effective inputs and the actual npm
  launcher inputs to command provenance and Red admission.
- Include the unpublished 0.2.5 draft fixes: mark unsupported Rust stub
  inference for manual repair and scope shared development instructions
  to the active Copilot CLI or Claude Code host.

### Upgrade

Check `npm view musubix6@0.2.6 version` before installing the exact version;
`@latest` may point elsewhere. Follow the host-specific README update steps,
back up local skill edits and refresh copied skills with `init --force`.
Updating the CLI alone does not refresh existing project skill copies.

### Validation and limitations

- Pass 72 native Windows development tests with no failures or skips on
  Node 20/22/24, including real npm/MSVC, source, Copilot/Claude copies and
  standalone script paths. This does not qualify Windows release support.
- Support only the standard adjacent `node_modules/npm/bin` layout for
  Windows npm/npx batch adapters. Other `.cmd`/`.bat` commands require an
  explicit native executable or Node-script command.
- Preserve the inherited 24-cell Linux x86_64 release scope and budgets.
  Add both Windows test files to the exact skill inventory without
  dropping any existing case. Two fresh unchanged qualification runs and
  separate exact-artifact human publication approval remain required.
- Keep macOS, actual WSL containers and live Claude interactions outside
  release qualification; no 0.2.6 publication or qualification is claimed
  by this candidate-preparation entry.

## [0.2.5] - Unreleased draft prepared 2026-11-01

Prepare a stable patch candidate containing the #381 and #382 fixes.
This draft does not establish publication or release qualification.

### Fixed

- Mark unsupported Rust stub inference explicitly for manual repair instead
  of presenting guessed signatures as reliable compiler evidence.
- Infer typed boolean Results, supported boolean loop shapes and method
  arguments only with sufficient scoped evidence; retain manual fallbacks.
- Scope development model, commit attribution and safe-boundary context
  resets to Copilot CLI or Claude Code in both shared development skills.
- Audit actual source-installed and packed skills for host-default
  regressions, including hidden directives and swapped host labels.

### Upgrade

Use the documented host-specific update steps. Check
`npm view musubix6@0.2.5 version` before installing that exact version;
`@latest` may still resolve to the published 0.2.4.
Back up local skill edits before running the documented `init --force`
command: updating the CLI alone does not refresh copied skills.

### Release status and known limitations

- Require two complete clean runs of the unchanged frozen 0.2.5 candidate
  and inherited 24-cell Linux matrix; previous qualification gives no credit.
- Keep unsupported Rust inference marked for manual repair, and Windows,
  macOS, actual WSL containers and live Claude interactions unqualified.
- Require separate human publication approval of the exact artifact
  paths/hashes and residual risks; preparation does not authorize publishing.

## [0.2.4] - Unreleased draft prepared 2026-10-30

Prepare a stable patch candidate in place of the unreleased 0.2.3 candidate.
This entry does not establish npm publication, release qualification or
permission to publish.

### Changed

- Target stable version 0.2.4 in package metadata and version-pinned examples;
  keep normal installation and updates on npm's mutable `@latest` tag.
- Carry forward GiNZA 5.3 support: `ginza>=5.3.0,<5.4`,
  `ja-ginza>=5.3.0,<5.4` and `spacy>=3.8.16,<4`.
- Keep Node.js 20 and Python 3.10 as the minimum versions, with Python 3.12
  recommended upstream for GiNZA 5.3.

### Fixed

- Preserve archived executable permissions under restrictive umasks and
  cumulative AI cost history when older local sessions disappear.
- Retain reproducible Linux qualification helpers with exact candidate,
  dependency, command and evidence bindings; isolate writable native caches.
- Bind legacy mutation diagnostics to their independently owned assertions
  without mistaking quoted loader-error examples for actual setup failures.

### Upgrade

Use the [English](README.md#installation) or
[Japanese](README-ja.md#インストール) installation instructions. Before
pinning this candidate, check `npm view musubix6@0.2.4 version`; do not install
that exact version unless the check succeeds and reports `0.2.4`.
Updating the CLI does not refresh previously copied skills. Back up local
skill edits before using the documented host-specific `init --force` steps.

### Release status and known limitations

- Require two consecutive complete clean runs of the unchanged frozen
  0.2.4 candidate and 24-cell Linux matrix. The incomplete 0.2.3
  qualification transfers no credit.
- Keep Windows, macOS, actual WSL container execution and live Claude
  interactions explicitly unqualified.
- Require separate human publication approval of the exact artifact
  paths/hashes and residual risks. Commit/push alone does not grant
  qualification or publication approval.

## [0.2.3] - Unreleased draft prepared 2026-10-29

Prepare a patch candidate for GiNZA 5.3. This entry does not establish npm
publication, release qualification or permission to publish.

### Changed

- Update the Japanese prose scripts to `ginza>=5.3.0,<5.4`,
  `ja-ginza>=5.3.0,<5.4` and `spacy>=3.8.16,<4`.
- Document Python 3.10 or later for GiNZA 5.3 and upstream's Python 3.12
  recommendation; retain the CLI's Node.js 20 minimum.
- Provision `uv` in CI and test the installed GiNZA model, diagnostics,
  terminology extraction and command errors.

### Fixed

- Check npm's mutable `latest` tag warning without requiring a particular
  historical published version in the installation regression.
- Preserve archived executable permissions during package regression
  extraction, including under restrictive shell umasks.
- Preserve cumulative AI cost history when older sessions disappear from
  the local store, without counting active-session snapshots twice.
  This fix affects repository accounting tooling, not the installed CLI.

### Upgrade

Keep Python 3.10 or later and Node.js 20 or later available; these minimum
versions are unchanged.

Check availability before installing the candidate:

```sh
npm view musubix6@0.2.3 version
```

As of 2026-10-29, npm lists 0.2.0 and 0.2.2, but not 0.2.3. Published
versions cannot be overwritten. Until 0.2.3 is available, use the source
checkout or remain on a published version. After a successful availability
check that prints exactly `0.2.3`, run the installation below. If the check
fails or does not print that version, stop and resolve the registry error
or use the source checkout instead.

```sh
npm install -g musubix6@0.2.3
musubix6 --version
```

Updating the CLI alone does not refresh previously copied skills. Back up
`.github/skills/japanese-prose/` and/or `.claude/skills/japanese-prose/`,
including local edits, before refreshing the skill for the existing host:

```sh
musubix6 init . --host copilot --only japanese-prose --force
```

Use `--host claude` or `--host both` instead for the corresponding existing
installation. `--force` overwrites bundled files; review the resulting diff.
The next `uv run` resolves the updated inline dependencies automatically.
To undo the skill refresh, restore the backed-up skill directories.

### Release status and known limitations

- Do not transfer earlier versions' validation runs or publication approvals
  to this candidate. Two consecutive clean runs of the unchanged frozen
  support/candidate/test matrix and separate exact-artifact human approval
  remain required. The proposed Linux-only scope retains all 24 inherited
  non-WSL required cells and explicitly excludes NATIVE-WSLC as unvalidated;
  that scope reduction requires human approval.
- Treat the earlier full SDD gate PASS as development evidence only, not
  qualification for 0.2.3.
- Identify the source package, lockfile and CLI as 0.2.3 after reapproval
  of the version-bound contract; this does not establish publication.
- Treat required missing, skipped or unparseable evidence as incomplete,
  not passing. The inherited qualification launchers are currently missing
  from this environment and are being recovered; no 0.2.3 qualifying run
  has completed.
- Limit release qualification to Linux x86_64. Keep live Claude interactions,
  actual WSL container execution and macOS/Windows behavior explicitly excluded
  and unqualified. The accounting writer uses POSIX locking.

## [0.2.0] - Unreleased draft prepared 2026-10-22

Add Claude Code installation alongside GitHub Copilot CLI without changing
the default Copilot workflow. The intended npm release is `0.2.0` on `latest`.
The source package targets `0.2.0`; this draft does not mean that it has been
published or qualified for release.

### Breaking changes and migration

- Reject repeated `--only` options and multiple `init` destinations instead
  of guessing which value to use. Update automation to pass one destination
  and one comma-separated `--only` list.
- Keep valid existing Copilot commands unchanged: `musubix6 init .` still
  installs into `.github/skills/`; Node.js 20 or later is still required.

### Added

- Add `musubix6 init [dir] --host copilot|claude|both`; omitting `--host`
  continues to select Copilot.
- Install nine shared skills into `.claude/skills/` for Claude Code, or
  populate both hosts' directories with `--host both`.
- Report installed/skipped destination paths so dual-host updates can be
  reviewed separately.

### Changed

- Resolve bundled scripts and references relative to the loaded skill
  directory rather than assuming a project-level `.github/skills/` path.
- Use Copilot's `ask_user` or Claude Code's `AskUserQuestion` for questions
  and approvals. If the tool is unavailable, wait for an explicit response
  in conversation; never infer or record human approval without it.
- Preserve skip behavior per host. With `--force`, overwrite bundled files
  while retaining extra local files; do not merge locally edited contents.
- Reject missing, unknown or repeated `--host` values before writing.
  Use space-separated options such as `--host claude`, not `--host=claude`.

### Install and upgrade

Check that the intended version is available before using the npm commands:

```sh
npm view musubix6@0.2.0 version
```

If that check fails, do not run the installation below: use the source
checkout or remain on the published 0.1.x version until 0.2.0 is available.
After publication, install the CLI and choose the project host:

```sh
npm install -g musubix6@0.2.0
musubix6 --version

# Choose one installation target:
musubix6 init . --host claude
# Or install for both hosts:
musubix6 init . --host both
```

Updating the global CLI alone does not refresh copied skills. Back up the
selected project's `.claude/skills/` and/or `.github/skills/` first, then
choose the corresponding refresh command and review the resulting diff:

```sh
musubix6 init . --host claude --force
# Or refresh both hosts:
musubix6 init . --host both --force
```

Use `--only lean-sdd-tdd,tech-writer` to limit either operation to selected
skills. `musubix6 sdd` remains a host-independent wrapper.

### Known limitations and release status

- Keep `agent-watchdog` Copilot-only because it depends on Copilot scheduling
  and agent tools. Full Claude/both installs explain its omission from Claude.
  Explicit `--only agent-watchdog` with `--host claude` or `both` exits 2
  before writing either destination.
- Install no `CLAUDE.md`, hooks, plugins or automatic permission grants.
  Skill installation does not initialize the target project's `.sdd` state.
- Do not promise transactional copying: filesystem failures are reported,
  but a partially completed install is not rolled back.
- Keep live Claude skill discovery/interaction, actual WSL container execution,
  GiNZA setup in a new target and macOS/Windows behavior explicitly unverified.
- Retain the four pre-existing `TODO` cases and the previously documented,
  unexplained ESLint-flakiness risk; TODOs are not passing results.
- Treat the successful development gate and host regression/mutation checks
  as development evidence only. The final 0.2.0 source/artifact and fixed
  support matrix still require two consecutive clean qualifying runs and
  separate exact-artifact human approval before publishing.

## [0.2.0-dev.0] - Development started 2026-10-21

This is the v0.2.0 development line, not a published or qualified release.
No prior v0.1.x qualification applies, and publishing/tagging requires separate
exact-artifact approval after fixed-matrix qualification.

### Added

- Add `init --host copilot|claude|both`, preserving the default Copilot destination.
- Copy nine shared skills into `.claude/skills/` for Claude Code; keep
  `agent-watchdog` Copilot-only. Implicit full installs explain its omission
  from Claude; incompatible explicit selections fail before any writes.
- Add host-policy, overwrite, relocated-helper and real npm-payload regressions.

### Compatibility and upgrade notes

- Update the CLI from source, back up copied skills and refresh with
  `musubix6 init . --host claude --force` or `--host both --force`.
- Preserve per-host skip behavior and extra local files with `--force`.
  Reject repeated value options and multiple destinations instead of guessing.
- Resolve executable paths from the loaded skill directory and use each host's
  native question/approval tools without bypassing human confirmation.
- Keep Claude live-session discovery/interaction, WSL execution, GiNZA setup
  and other operating systems explicitly unverified until exercised.

## [0.1.4] - Candidate prepared 2026-10-21

Publication requires two clean fixed-matrix runs for this candidate and separate
exact-artifact approval; the 0.1.3 qualification does not apply to these changes.

### Compatibility and upgrade notes

- Preserve existing CLI commands, Node.js 20-or-later support and advisory linter exit codes. Back up local skill edits and review the updated workflows before refreshing copied skills with `musubix6 init . --force`.
- Install `markdown-it-py` alongside the documented GiNZA dependencies when using Japanese prose diagnostics.

### Added

- Bundle `consulting-analyst` and `presentation-planner`, bringing the distributed skill set to ten without adding standalone `obsidian*` skills.

### Changed

- Update `japanese-prose` and `tech-writer` with proofreading checks, hash-bound semantic-review invariants, document templates and analysis/presentation handoffs.

### Fixed

- Detect case-insensitive unfinished markers with optional horizontal whitespace and ASCII or full-width colons, while excluding matching inline-code spans, URLs, link destinations and compound names such as `TODO-cli`.
- Preserve the existing lower-case todo-app exception and report empty or unclosed tracking annotations without erasing nonempty annotation content.

### Known release limitations

- Keep placeholder detection lexical, not a complete Markdown parser or natural-language intent classifier; use a colon or uppercase marker for ambiguous unpunctuated lowercase text.
- Retain four pre-existing TODO cases without counting them as passes. The earlier ESLint test failure has not been reproduced or explained; one first-run full-gate success does not establish that its cause is fixed.

## [0.1.3] - Candidate prepared 2026-10-20

Release target; publication requires fixed-matrix qualification and separate
exact-artifact approval.

### Compatibility and upgrade notes

- Use Node.js 20 or later. Upgrade the CLI, back up locally edited skills, then refresh each project's copied skills with `musubix6 init . --force`; updating the global CLI alone does not refresh those copies.
- Select diagnostics explicitly, for example with `musubix6 sdd diagnostics --profile javascript --json`; the other profiles are `typescript`, `python` and `rust`. Omitting `--profile` selects TypeScript, not automatic language detection.
- Keep the existing tests, expected-assertion Red, approvals and final full gate. Diagnostics are snapshots, not evidence or a replacement for those checks; no measured time or AI-cost savings are claimed.

### Added

- Add early TypeScript diagnostics using root-local TypeScript 5.9.x and ESLint 9.x, a root `tsconfig.json` and one root flat ESLint config.
- Add standalone JavaScript diagnostics using root-local ESLint 9.x without requiring TypeScript or `tsconfig.json`.
- Add Python diagnostics using a root `.venv` with Python 3.14.x, Ruff 0.17.1 and mypy 2.4.0; honor root configuration and native exclusions, and disclose unavailable mypy columns on non-ASCII lines.
- Add Rust diagnostics using installed cargo/rustc 1.99.x, one root package, `Cargo.lock` and an existing external Cargo home; check all targets offline and locked with default features.
- Report versioned JSON and explicit exit codes: PASS/0, FAIL/1 for diagnostic errors, and INCOMPLETE/2 for missing prerequisites or unfinished diagnosis.

### Operational limits

- Bound each provider to 60 seconds and 8 MiB of combined native output, except Rust's 180-second budget. Do not install tools, fix files or save diagnostic history automatically.
- Remove parent-owned private Rust build outputs before returning; normal external Cargo dependency-cache bookkeeping and archive extraction may persist, with automatic cache cleaning disabled.
- Treat executable configs, plugins, build scripts and proc macros as trusted code, not sandboxed code. Cleanup after parent SIGKILL, power loss or self-detached descendants is not guaranteed.
- Retain the four pre-existing S3 TODO cases and tracker [#315](https://github.com/nahisaho/musubix6/issues/315); TODOs are not passes. Publication remains subject to prospective fixed-matrix qualification and separate exact-artifact approval.

## [0.1.2] - 2026-10-19

### Compatibility and upgrade notes

- Review source-scan settings if your project contains large source files. Included source files are now scanned completely up to `scan.maxFileBytes` (default: 16777216 bytes, 16 MiB); larger files cause an explicit refusal instead of being silently omitted. Use deliberate include/exclude filters or configure a positive safe-integer limit; this is not a total-memory limit.
- Refresh previously copied skills after upgrading the npm CLI with `musubix6 init . --force`. Back up local skill edits first: `--force` overwrites them.
- Keep running the full `gate` before merge. The new `context` command selects reading material; its output is not validation or approval evidence.

### Added

- Add `musubix6 sdd context` to select complete specifications by exact feature name, REQ ID, specification path, existing file path, or `--changed`.
- Include declared artifacts, recursive plan prerequisites, affected consumer features, file paths, and SHA-256 hashes in selected context.
- Bound the entire context output to 16384 UTF-8 bytes by default, with `--max-bytes` and `--json` options; reject invalid selectors, ambiguous definitions, missing dependencies, cycles, escaped paths, and over-budget output without emitting partial specification bodies.

### Changed

- Direct bundled SDD skills to read selected specifications through `context` without narrowing validation.
- Use `npm test` consistently for repository, CI, and publish-workflow checks, including context and source-discovery regressions.

### Fixed

- Discover annotations beyond the former 512 KiB source cutoff and refuse oversized or malformed scan inputs before writing evidence.
- Recognize executed native Node test summaries without treating zero-test phrases inside test titles as evidence that no tests ran.
- Select the isolated ownership regression by its stable TEST ID and require its named TAP result, so an empty passing test file cannot impersonate target execution.

### Known release limitations

- The published npm archive contains four unintended Python cache files under `.github/skills/japanese-prose/scripts/__pycache__/`. All files shared with the prepared candidate are byte-identical, but the archives differ; removing local caches does not change the published package.
- Do not treat publication as release qualification: the fixed candidate/support matrix was not frozen and its two consecutive qualifying runs were not performed before publication.
- Retain four pre-existing S3 TODO cases and the unresolved tracker [#315](https://github.com/nahisaho/musubix6/issues/315); these cases are not counted as passes.

Publication evidence and remaining qualification gaps are recorded in
[`.sdd/release-validation.v0.1.2.results.json`](.sdd/release-validation.v0.1.2.results.json).

## [0.1.1] - 2026-10-16

### Added

- Publish the first non-prerelease npm version with the `musubix6` CLI: `--version`, `list`, `init`, and the `sdd` wrapper.
- Bundle eight skills: `lean-sdd-tdd`, `lean-agentic-coding`, `sdd-spec-interview`, `sdd-reverse-spec`, `tech-writer`, `japanese-prose`, `wslc-containers`, and `agent-watchdog`.
- Support explicit installation destinations, selective skill copying with `--only`, and overwrite control with `--force`.
- Provide SDD/TDD workflows with REQ/TEST traceability, Red/Green evidence, specification approvals, impact analysis, and project-native test runners.

### Requirements

- Require Node.js 20 or later for the CLI and SDD scripts, with no runtime npm dependencies.
- Require Python, uv, and GiNZA for Japanese prose diagnostics, and the relevant native toolchains for project tests or WSL container operations.

[0.1.4]: https://www.npmjs.com/package/musubix6/v/0.1.4
[0.1.3]: https://www.npmjs.com/package/musubix6/v/0.1.3
[0.1.2]: https://www.npmjs.com/package/musubix6/v/0.1.2
[0.1.1]: https://www.npmjs.com/package/musubix6/v/0.1.1
