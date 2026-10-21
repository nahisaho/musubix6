# Changelog

User-facing changes to musubix6, with upgrade guidance and known release limitations.
Release dates use Japan Standard Time (UTC+09:00).

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
