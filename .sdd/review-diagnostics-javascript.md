spec: sha256:43c146b0a84b6ed6d3a6be3633e2b68d9aded4440b13bc22d570a5f9f1ff1b33
verdict: pass
open: 0

## Historical design review
Claude Sonnet 5.5 independently read the complete 25-line JavaScript specification and reported no JavaScript findings. The later language-boundary review read its EARS section with the common/workflow contracts and found no added TypeScript prerequisites. The final consistency review verified the unchanged specification hash.
The author's isolated ESLint9.39.5 observation demonstrated JSX diagnosis without TypeScript or tsconfig. It is a native API feasibility observation, not proof of the unimplemented JavaScript adapter.

## Implementation review
Claude Sonnet 5.5 independently reviewed the standalone JavaScript selection and tests, native ignores, JSX/unconfigured input behavior, local-only prerequisites and distribution/docs consistency; no JavaScript implementation finding was reported. The adapter/document axis then completed two clean delta passes on the same frozen manifest after Python/Rust fixes. The added enumeration limitation accurately discloses conservative failure on unresolved symlink targets.
Actual JavaScript regression Greens and assertion-detected selection/ignore/cache mutations are distinct from the old spike. Source/wrapper/packed/initialized execution is covered in the final combined 34-pass, zero-skip run.

## Limits
The final configured gate was not run at this review snapshot. Other OS/Node20/22, remote CI and release qualification remain unverified; these reviews authorize no release or publication.

## Repository configuration design review (2026-10-23)

Claude Sonnet 5.5 reviewed the new repository configuration contract and regression before implementation.

| ID | State | Disposition |
| --- | --- | --- |
| CONFIG-01 | Fixed | Add diagnosis of all tracked repository JavaScript copied into an isolated checkout with the actual config. Running diagnosis in the live root during concurrent tests would include their deliberately invalid temporary fixtures; run that command separately after tests. The config-root override is a bounded isolated-mutation seam, not a success fallback. |
| CONFIG-02 | Fixed | Require ignored=0 and every independently enumerated recommended rule to resolve to error on each extension/hidden-path control, plus noInlineConfig=true. No optional non-recommended rule is promised. |
| CONFIG-03 | Rejected | Existing valid Node, JSX and CommonJS controls exercise the promised syntax/globals; no separate ecmaVersion policy was requested. |
| CONFIG-04 | Fixed | Exercise real init and npm pack --dry-run boundaries to prove the repository config is not copied or packed. |
| CONFIG-05 | Rejected | Missing developer dependencies must fail explicitly; the normal manifest-driven install provides pinned direct packages. |
| CONFIG-06 | Fixed | Update the specification date. Pending evidence remains explicitly pending until observed. |

Native recommended-rule feasibility and the missing-config assertion failure are recorded separately from implementation success.

## Strict repository lint implementation evidence

The coordinator observed actual root PASS with 20 included/checked inputs, zero ignored files and zero diagnostics. All 102 baseline recommended-rule findings were removed without severity overrides, ignores or inline suppressions. TEST-DIAGJS-004 has a genuine missing-config assertion Red and Green, with accepted native npm array/object JSON shapes; the earlier npm-shape TypeError and rejected stale-test Green are not credited as Red or success evidence.

Eight isolated configuration mutations were assertion-detected, with valid-before/restored controls passing and the real config hash unchanged. Forty stale existing registered tests were re-executed: 39 refactor passes preserve the original Red histories; TEST-R36H-PYTEST-001 instead has fresh strong Red for omission of the real CI PATH export, followed by byte-restored workflow Green. No historical ledger entry was rewritten. Differential bounds are recorded in the specification and files/js-cleanup-differential.json, not presented as exhaustive terminal-protocol equivalence.

Two independent Claude Sonnet 5.5 reviewers each performed two clean bounded delta passes: production cleanup/error-history semantics, and configuration/test/dependency/distribution integration. They found no actionable introduced bug. Their stated limits are retained: the semantics reviewer did not read the last approximately 83 lines of the test-only delta; the integration reviewer verified the final spec hash rather than independently reviewing its evidence prose, and inspected docs/package metadata only in selected ranges. The earlier design review covered the new normative contract. Neither reviewer ran the full gate or independently verified raw mutation logs.

The semantics review noted that malformed non-object JSON ledger lines normalize differently after the key helper's cleanup. This is not an accepted ledger shape; valid event objects preserve the same fields/order, and the gate rejects an invalid current ledger. No policy relaxation was accepted. Node's standard ANSI utility deliberately strips additional recognized VT sequences beyond the old SGR regex; this bounded behavior expansion is disclosed in the specification.

Frozen reviewed digests:
- eslint.config.mjs: 52173b7ebd91358cfdec9cb37da7fe5ab83a97f2aec20f2a32f9357cf3748f34
- sdd.mjs: d549b575193a5e3befc2196355fe732d1d87aca02a241e27d9435ecf9a01793c
- diagnostics-profiles.test.mjs: f2f57c8d742e0a1f744f345a5a3029e182bc424c10507b6f98131707bdf8d389

Full-root gate resumed after the original shell disappeared without a result: FAIL (exit1), with all 139 evidence checks and locks accepted but the project test command failing. Unabridged subsequent npm execution had 1,134 tests, 1,133 passes, one failure, zero skips/TODOs: the old TEST-R36I-LEGACY-001 dynamically called the removed, production-unconsumed text-only probe wrapper and sliced past its declaration boundary. This was an introduced test compatibility defect missed by the bounded earlier reviews, not a flaky PASS or a missing dependency.

The user explicitly approved adapting that internal characterization to the actual raw outcome helper without removing raw-text/metadata/options checks. Its updated contract and independent review are recorded in .sdd/specs/r36i-c-compiler.md and .sdd/review-r36i-c-compiler.md. Seven isolated mutations were assertion-detected; the raw-text mutant produced official strong Red and unchanged production produced Green; native C controls also passed. Production and config remain at the frozen digests above, but the old diagnostics-profiles test digest applies only to that file, not the subsequently repaired sdd.test.mjs.

The resumed environment reports Node24.22.1/npm11.19.1 rather than the earlier Node24.21.0 runtime; scope warnings about executable fingerprints are not silently treated as the same environment. The 48-case diagnostics/host/source/context selector passed without skips on the resumed runtime. Previous #381 PASS and the failed gate do not qualify the repaired bytes. Other OS/Node versions and frozen release qualification remain unverified; no publication is authorized.

## Final repaired-candidate result

Full-root gate PASS (exit0), retained in session 377eb86a files/js-config-full-gate-repaired.log. The required npm test completed in 3438.3 seconds without a retry/FLAKY notice; every lock passed, trace had 84 requirements and zero errors, the 564-entry ledger chain was intact, and 139/139 tests had accepted evidence. This observed clean gate supersedes the pending state, not the historical failed/interrupted runs.

Residual configured warnings remain: six trace warnings, two source-file placeholder warnings under warn policy, one weak Red, 76 historical characterizations, the existing TEST-R36D-OWN-001 retest notice, and 39 explicit refactor records after lint-only test/setup changes. Those are not claimed as newly assertion-proven histories. Final root JavaScript diagnostics separately PASS with 20 included/checked, zero ignored inputs and zero diagnostics (files/js-config-final-diagnostics.json). Production/config/test/spec hashes were unchanged after this gate; owned test scratch directories were absent. This is a development gate result, not the frozen two-run release matrix or publication approval.
