---
feature: r36h-pytest-ci
tier: T1
---
REQ-R36H-PYTEST-001: When a hosted test job provisions pytest, it shall export an isolated RUNNER_TEMP virtual environment whose actual pytest runs with PYTHONNOUSERSITE=1, preserving runner sanitization and review requirements.
| REQ | PASS condition | counterexample | TEST/command | evidence |
|---|---|---|---|---|
| `REQ-R36H-PYTEST-001` | Both test workflows create a real venv, export its bin through GITHUB_PATH, and execute real pytest with user-site disabled; assertion Red then Green and reviewed-prefix controls retain their verdicts. | User-site-only install, missing PATH export, skipped pytest, or accepted unreviewed selector change. | TEST-R36H-PYTEST-001; focused #341 native controls on Node 20/22/24 | Assertion Red; 8 selected passes per runtime; 2 rejected mutations and restored positives |
Assumptions: Python 3.12 and pytest are already declared prerequisites; dependencies are restored only into private environments. No production/public-contract changes, timeout changes, or full-suite claims.
Integration: preserve existing CI prerequisites and qualification mutation purpose; history/runner verdict policy is unchanged. No data/state-machine migration applies.
Feasibility: private Python 3.12.15 + real pytest 9.1.1 reproduces case815 at line10436; normal pytest exits0, PYTHONNOUSERSITE=1 reports No module named pytest and exits1. Retained r36h-native-user-site-confirmed-red.log.
Command: prefix actual Node bin and provisioned venv bin to PATH, then `node --test --test-reporter=spec --test-name-pattern='#341 |TEST-R36H-PYTEST-001|r35b #364 (CI qualifies|publish test job)' .github/skills/lean-sdd-tdd/scripts/sdd.test.mjs`; all 24 selected executions pass. Node20 additionally reports 1,085 unselected cases as filtered skips, not executed evidence.
Red/Green: `node --test --test-name-pattern='TEST-R36H-PYTEST-001' .github/skills/lean-sdd-tdd/scripts/sdd.test.mjs`; missing provisioning asserts Red before implementation. The regression executes both real shell provisioning blocks with offline wheels reconstructed from installed prerequisite bytes, then actual pytest assertion Red and native Green under PYTHONNOUSERSITE=1.
Mutations: remove only ci.yml GITHUB_PATH export, assert failure, restore and pass; repeat independently for publish.yml. Retained r36h-mutation-{ci,publish}-path-{red,restored-green}.log; initial Red r36h-regression-red.log; runtime positives r36h-node{20,22,24}-focused-green.log; real network restore/effective identity r36h-effective-provision-native.log, all under coordinator session files.
Limits: no full suite, full gate, release qualification, cost generation, or readiness claim; focused checks only as requested. Runner script remains byte-identical, single-file and zero-runtime-dependency; unrelated qualification mechanisms remain coordinator scope.
