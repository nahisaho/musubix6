# Changelog

User-facing changes to musubix6, with upgrade guidance and known release limitations.
Release dates use Japan Standard Time (UTC+09:00).

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

[0.1.2]: https://www.npmjs.com/package/musubix6/v/0.1.2
[0.1.1]: https://www.npmjs.com/package/musubix6/v/0.1.1
