# musubix6

Agent skills for **lean, spec-driven and test-driven development** and for
**technical writing in Japanese and English, structured analysis and presentation planning**, packaged for GitHub Copilot CLI
(`.github/skills/`) and Claude Code (`.claude/skills/`).

The source checkout targets **0.2.0**. Check npm availability below before
installing; a version string does not establish publication or release
qualification. Claude live-session discovery and interaction remain unverified.

[日本語](README-ja.md) | [npm](https://www.npmjs.com/package/musubix6) | [Changelog](CLANGELOG.md)

| Skill | Purpose |
|---|---|
| [`lean-sdd-tdd`](.github/skills/lean-sdd-tdd/SKILL.md) | Autonomous spec-driven (SDD) and test-driven (TDD) development with REQ/TEST IDs, Red→Green proof, hash-locked specs, trace check and a compact `gate`. Backed by the zero-dependency script `scripts/sdd.mjs`. |
| [`lean-agentic-coding`](.github/skills/lean-agentic-coding/SKILL.md) | Risk tiers (T0–T2), context budget, delta review and a compact gate to cut token usage while keeping rigor. |
| [`sdd-spec-interview`](.github/skills/sdd-spec-interview/SKILL.md) | Interviews the user one question at a time and writes the SDD spec (`.sdd/specs/<feature>.md`). |
| [`tech-writer`](.github/skills/tech-writer/SKILL.md) | Structures README, design docs, test plans, runbooks, proposals, RFI/RFP, Qiita/Zenn articles and more (from [kotonoha](https://github.com/nahisaho/kotonoha), MIT). |
| [`japanese-prose`](.github/skills/japanese-prose/SKILL.md) | GiNZA-based Japanese prose diagnostics and proofreading, with protected-content checks and hash-bound semantic review for edits (from kotonoha, MIT). |
| [`consulting-analyst`](.github/skills/consulting-analyst/SKILL.md) | Structures decision questions, issue trees, hypotheses, evidence and option comparisons before document or presentation planning (from kotonoha, MIT). |
| [`presentation-planner`](.github/skills/presentation-planner/SKILL.md) | Plans presentation scenarios, slide outlines and design specifications; hands off PPTX generation to a dedicated skill rather than generating files itself (from kotonoha, MIT). |
| [`wslc-containers`](.github/skills/wslc-containers/SKILL.md) | Operate Linux containers on Windows via the built-in WSL container CLI (`wslc.exe`), without Docker Desktop (from [wslc-containers-skill](https://github.com/nahisaho/wslc-containers-skill), MIT). |
| [`agent-watchdog`](.github/skills/agent-watchdog/SKILL.md) | Detects stalled background agents (read-only `watchdog.mjs` for workspace idle time, plus a 5-minute scheduled idle check via `manage_schedule` that finds Idle agents with unfinished work with `list_agents` and resumes them with `write_agent`). |

## Requirements

| Tool | Needed for |
|---|---|
| Node.js ≥ 20 | `lean-sdd-tdd` (`scripts/sdd.mjs`, no `npm install`) |
| Python ≥ 3.10 and **[uv](https://docs.astral.sh/uv/)** | `japanese-prose` diagnostics and `tech-writer` lint |
| **[GiNZA](https://github.com/megagonlabs/ginza)** (`ginza`, `ja-ginza`, `spacy`) | `japanese-prose` morphological/dependency analysis |
| **[markdown-it-py](https://github.com/executablebooks/markdown-it-py)** | `japanese-prose` edit-invariant checks (`uv` resolves the script dependency) |
| Target stack toolchains (optional) | `gate`/`tdd` run the project's own test runner: Go, Cargo, JDK + Maven/Gradle, CMake, .NET, PHP, Julia, … |

### Install uv

```sh
# Linux / macOS
curl -LsSf https://astral.sh/uv/install.sh | sh
# or: pipx install uv   /   brew install uv
uv --version
```

### Install GiNZA

GiNZA 5.3 requires Python 3.10 or later; upstream recommends Python 3.12.

You normally do **not** install GiNZA by hand. The `japanese-prose` scripts
declare their dependencies inline (PEP 723), so `uv run` resolves
`ginza>=5.3.0,<5.4`, `ja-ginza>=5.3.0,<5.4` and `spacy>=3.8.16,<4` into an
isolated environment on first use (the first run downloads the model and
takes a while):

```sh
uv run .github/skills/japanese-prose/scripts/lint.py path/to/document.md
```

To install it manually into a virtual environment instead:

```sh
uv venv && source .venv/bin/activate
uv pip install "ginza>=5.3.0,<5.4" "ja-ginza>=5.3.0,<5.4" "spacy>=3.8.16,<4"
python .github/skills/japanese-prose/scripts/lint.py path/to/document.md
```

Without GiNZA the prose pass is reported as not performed; the structural
lint of `tech-writer` still works without `uv`:
`python3 .github/skills/tech-writer/scripts/lint.py path/to/document.md`.
GiNZA dependency and license details: [`NOTICE.md`](.github/skills/japanese-prose/NOTICE.md).

## Usage

Copilot CLI loads the skills from `.github/skills/`; Claude Code discovers
project skills in `.claude/skills/`. Examples below use Copilot paths: substitute
`.claude/skills/` for direct scripts in a Claude installation, or use the
host-independent `musubix6 sdd` wrapper. Ask in
natural language, for example:

- "Add rate limiting to the API" → `lean-sdd-tdd` (spec → Red → Green → gate)
- "〜を作りたい" → `sdd-spec-interview` writes the spec first
- "Write a design doc for …" / 「テスト計画書を作って」 → `tech-writer`

Running the SDD script directly:

```sh
S="node .github/skills/lean-sdd-tdd/scripts/sdd.mjs"
$S --root <app> init
$S --root <app> tdd red TEST-F-001
$S --root <app> tdd green TEST-F-001
$S --root <app> gate
```

### Read only the specifications needed for a change (v0.1.2)

Use `context` instead of loading every requirements file into the agent:

```bash
node .github/skills/lean-sdd-tdd/scripts/sdd.mjs context spec-context
# After installing musubix6, run the same command through the wrapper:
musubix6 sdd context REQ-SPECCTX-001 --json
# In a target project: replace the example path with an existing source file.
musubix6 sdd context src/example.mjs --max-bytes 32768
```

Selectors are exact, case-sensitive feature names, REQ IDs, specification paths,
or existing project files; multiple selectors form a union. The output includes
whole selected specs, their declared `artifacts`, and recursive prerequisites
from `.sdd/plan.md`, with file paths and SHA-256 hashes. File selection reuses
`impact`, including affected consumer features. It is static and file-granular,
not semantic search: select additional features explicitly for undeclared
relationships. No summary, persistent cache, or model service is used.

The default limit is **16384 UTF-8 bytes for the entire output**, including JSON
escaping and metadata, not an estimated token count. On overflow, exit 2 returns
no bodies, the required size, and up to 10 feature-size entries. Narrow the task
or explicitly raise `--max-bytes`. Unknown/ambiguous selectors, missing
prerequisites/artifacts, duplicate definitions, dependency cycles and paths
escaping the project root are errors, not partial success.

`--root DIR` chooses the target project (default: working directory).
`context --changed` uses Git's current staged, unstaged and untracked files;
every changed file must resolve. Clean trees, deleted/unowned files and missing
Git fail explicitly; select a feature/REQ instead. Bundled SDD skills now use
this selective reading workflow. Repository scanning still happens locally;
the limit reduces agent input, not machine-side scanning or memory.
Context is **not validation or approval evidence**: existing checks remain
unchanged, and the full `gate` is still required before merge.

### Diagnose projects before running the final gate (v0.1.3)

This section describes the **0.1.3** diagnostics contract; version 0.1.2
does not include this feature. Check availability with
`npm view musubix6@0.1.3 version` before installing, or use the source checkout.
Back up locally edited skills, then refresh copied skills with
`musubix6 init . --force`, which overwrites them; see the update steps below.

The default `typescript` profile needs `node_modules/typescript` **5.9.x**,
`node_modules/eslint` **ESLint 9.x**, a root `tsconfig.json`, and exactly one
root `eslint.config.js`, `eslint.config.mjs` or `eslint.config.cjs`. Existing
plugins/parsers must already be installed. Packages may be symlinks; ancestor
or global installations are not used. Hoisted-only workspaces and Yarn PnP
are not supported. Replace `/path/to/project` with your project directory:

```sh
musubix6 sdd diagnostics --root /path/to/project --json
# Without --json, read the same result as text:
musubix6 sdd diagnostics --root /path/to/project
# Explicit profiles; tools must already exist in the target project/environment:
musubix6 sdd diagnostics --root /path/to/project --profile javascript --json
musubix6 sdd diagnostics --root /path/to/project --profile python --json
musubix6 sdd diagnostics --root /path/to/project --profile rust --json
```

Omitting `--root` uses the working directory; omitting `--profile` means
`typescript`, never language autodetection. `--help` must be used alone.
The default profile checks the whole tsconfig-selected project and compiler
dependencies, not just edited files. JavaScript type checking follows
`allowJs`/`checkJs`. ESLint checks non-declaration script inputs and respects
ignores and unconfigured file types; its file counts disclose that scope.
Project references, `--changed`, automatic monorepo selection and LSP/IDE
connections are not supported.

| Profile | Required tools and scope |
|---|---|
| `javascript` | Root-local ESLint 9.x and one root flat config; no TypeScript/tsconfig. Recursively checks `.js/.jsx/.mjs/.cjs` (case-insensitive), excluding `.git/node_modules/.venv` and directory symlinks; respects native ignores/unconfigured inputs. |
| `python` | Root `.venv` only: Python 3.14.x, Ruff 0.17.1 and mypy 2.4.0, both mandatory. Checks project-wide `.py/.pyi`, excluding `.git/.venv` and directory symlinks; honors native exclusions, but not mypy's configured files/modules/packages. No notebook inputs or PATH/global/ancestor tool fallback. |
| `rust` | Installed cargo/rustc 1.99.x, root `Cargo.toml` and existing `Cargo.lock`, one root package, existing external Cargo home and cached offline dependencies. Runs `cargo check --all-targets --offline --locked` with default features, not Clippy/all features/multi-package workspaces. |

JavaScript/Python enumeration is conservative: a symlink whose target cannot be
resolved outside excluded directories makes that provider INCOMPLETE, even for an
unrelated file extension.

Python startup ignores `.pth`/`PYTHONPATH` and system-site packages. Root config
priority is Ruff `.ruff.toml` > `ruff.toml` > `pyproject.toml[tool.ruff]`,
and mypy `mypy.ini` > `.mypy.ini` > `pyproject.toml[tool.mypy]` >
`setup.cfg[mypy]`. Shared configs without the relevant section do not apply;
malformed configs are incomplete. No applicable config means isolated defaults,
not nested/ancestor discovery. Explicit config extensions/imports/plugins are trusted.

| Result | Exit code | Meaning |
|---|---|---|
| PASS | 0 | All required providers completed; no errors. Warnings are still reported. |
| FAIL | 1 | All required providers completed and found errors. |
| INCOMPLETE | 2 | A provider, input or configuration failed; this is not a clean result. |

INCOMPLETE takes precedence over any collected errors. Missing tools,
unsupported versions, broken config/plugins, no eligible ESLint inputs,
all inputs ignored, signals, malformed output and limits are not passes.
Each provider has a **60-second** limit (**180 seconds** for cargo-check) and a
combined native stdout/stderr limit of **8 MiB**, cumulative across probes,
selection and checking. Worker protocol output has a separate 8-MiB cap.
Fix the reported setup issue or
static error, then rerun; do not suppress the failure to claim completion.

JSON uses `schemaVersion: 1`, `profile`, resolved `root`, start/end timestamps,
`status`, `exitCode`, `reason`, `snapshot: true` and per-provider results.
Each provider includes its version/config path, completion status, reason,
file counts and diagnostics (`source`, `file`, 1-based UTF-16 `line`/`column`,
`code`, `severity`, `message`). Missing file locations are null. Incomplete
providers have null counts, not zero; TypeScript's checked count includes
compiler dependencies, so do not sum it with ESLint's count.
Python counts direct candidates/selected/excluded sources, not imported files;
imported-file diagnostics remain visible. mypy's columns on non-ASCII lines are
unreliable and returned as null with an `info/location-unavailable` notice.
Rust counts distinct metadata target roots/observed roots (ignored=0), not every
module or feature combination; early errors can leave checked below included.

The command does not install/download tools, fix sources, cache diagnostics,
or append TDD history. Python disables bytecode/Ruff/mypy persistence.
Rust overrides both target and build directories into private external scratch;
the parent stops owned workers/ordinary descendants and removes that scratch
before returning. Cleanup errors force INCOMPLETE. An existing `CARGO_HOME`
(relative paths resolve from the project), or default `~/.cargo`, must resolve
outside the project. Normal external Cargo cache management/materialization may
persist (`.global-cache`, `.package-cache`, `.package-cache-mutate`,
`registry/src` and registry markers); automatic cache GC is disabled.
These exceptions are not permission to change project outputs.
Configurations/plugins/build scripts/proc macros execute trusted local code
with arbitrary side effects, including possible network access: this is not a sandbox.
Parent SIGKILL/power loss and self-detached descendants cannot be fully cleaned.
Results are a **snapshot**, not proof of runtime correctness, TDD Red/Green,
approval or release readiness. Keep targeted tests and the final full `gate`.
Only Linux/Node 24 has been exercised locally; macOS/Windows remain unverified.
No measured time or AI-cost reduction is claimed.

### Claude Code and dual-host installation (v0.2.0)

Use the 0.2.0 CLI after checking npm availability below, or the
[source checkout](#install-from-source-git-clone), for these options.
The 0.1.x npm versions do not support `--host`.

```sh
musubix6 init /path/to/project --host claude
musubix6 init /path/to/project --host both
# Refresh copied Claude skills after backing up .claude/skills:
musubix6 init /path/to/project --host claude --force
```

| Host | Destination | Skills |
|---|---|---|
| `copilot` (default) | `.github/skills/` | All 10 |
| `claude` | `.claude/skills/` | 9 shared skills, excluding `agent-watchdog` |
| `both` | Both directories | The respective set for each host |

`agent-watchdog` is **Copilot-only**. Full Claude/both installs report its
omission from Claude on stderr. Explicit `--only agent-watchdog` with
`--host claude` or `both` exits 2 before writing either host.
`--only lean-sdd-tdd,tech-writer` limits each selected host. Existing directories
are skipped independently; `--force` overwrites bundled files but retains extra
local files. Back up and review both directories for a dual-host update.

`--host`, `--only` and `--force` work before or after the destination.
Use space-separated options (`--host claude`, not `--host=claude`).
Missing/unknown host values, repeated `--host`/`--only`, unknown options/skills
and multiple destinations exit 2 with stderr before any file writes.
Filesystem failures during copying are reported but not rolled back.
`list` still lists all bundled skills, including the Copilot-only watchdog.

In Claude Code, invoke a shared skill with `/lean-sdd-tdd` or ask naturally.
Question/approval workflows use the host's native tool; if unavailable, they
stop for an explicit conversational response rather than inventing approval.
No `CLAUDE.md`, hooks, plugin configuration or permission grants are installed.
The same scripts/assets are copied unchanged from the canonical `.github/skills`
payload. Local relocated-script checks are not live Claude qualification;
WSL container execution and macOS/Windows remain unverified.

### Install the published npm package

The commands below pin **0.2.0**, matching this source checkout. On
2026-10-27, npm served 0.2.0 and its `latest` tag was 0.2.2; the pinned
commands do not install `latest`. With Node.js ≥ 20 and npm, run them in
the project where you want to install the skills:

Check availability first. If that check fails, resolve the reported registry
or network error, or use the source checkout; do not assume the version is
unpublished.

```sh
npm view musubix6@0.2.0 version
npm install -g musubix6@0.2.0
musubix6 --version
musubix6 init .
musubix6 list
```

Without a global install, run `npx --yes musubix6@0.2.0 init .` instead.
`init` copies the bundled skills into the target's `.github/skills/`.

`init` accepts a relative or absolute destination; omitting it uses the current
directory. `--force` and `--only a,b` can appear before or after the destination.
Unknown options or a missing/empty `--only` skill list exit with status 2 without
creating or overwriting files.

See the [changelog](CLANGELOG.md) for changes and known release limitations;
npm publication does not establish fixed-matrix release qualification.

To install per-user instead of per repository, copy the skill directories to
`~/.copilot/skills/`.

### Install from source (git clone)

For a development checkout rather than a published npm version:

```sh
git clone https://github.com/nahisaho/musubix6.git
cd musubix6
npm install -g .               # or: npm link
musubix6 --version
musubix6 init ../my-project
musubix6 list
```

The global install links to this checkout, so keep the directory. To update,
follow the source-update instructions below. A checkout can contain changes not
yet published to npm. Installing the CLI alone does not copy skills into other
projects: `init` above creates `../my-project` and installs the default Copilot
skills there. Replace that destination with your project path; add
`--host claude` or `--host both` for the other hosts.

Installation was checked on 2026-10-27 with Linux, Node 24.22.1 and npm
11.19.1 in `/tmp/musubix6`, using an isolated npm global prefix to avoid
changing the shared global CLI. The pinned npm install, npx and source install
succeeded; Copilot received 10 skills and Claude received 9. The installed
SDD wrapper and `tech-writer` lint ran successfully, as did the GiNZA lint
with dependencies resolved by `uv run`. These checks do not establish live
Copilot/Claude skill discovery or release qualification.

## Update the CLI and installed skills

Updating musubix6 has **two separate parts**: update the CLI, then refresh the
skills copied into each project. `npm install -g` alone does not update an
existing project's `.github/skills/` or `.claude/skills/`.
The steps below use the default Copilot host. For the v0.2.0 CLI,
back up/review `.claude/skills/` and add `--host claude` to refresh Claude copies,
or use `--host both` and back up/review both directories.

### Update a project installed from npm

1. Check the installed CLI version and the version published on npm:

   ```sh
   musubix6 --version
   npm view musubix6 version
   ```

2. In the target project's root, back up its existing `.github/skills/` before
   overwriting anything. This Bash example (Linux, macOS, or WSL) stores the
   backup under your home directory, outside a typical project checkout:

   ```bash
   backup_dir="$(mktemp -d "$HOME/musubix6-skills-backup.XXXXXX")"
   cp -R .github/skills "$backup_dir/skills"
   printf 'Backup: %s\n' "$backup_dir"
   ```

   Keep the backup until you have reviewed the update. If this directory does
   not exist yet, use the installation instructions above instead.

3. Update the global CLI to the latest published version:

   ```sh
   npm install -g musubix6@latest
   musubix6 --version
   ```

   To install a specific version instead, use a version such as
   `npm install -g musubix6@0.2.0`. Updating the CLI does not overwrite project
   files at this stage.

4. From the target project's root, refresh the bundled skills:

   ```sh
   musubix6 init . --force
   ```

   Without `--force`, existing skill directories are skipped, not updated.
   With `--force`, bundled files are overwritten; this is not a merge of local
   edits. Extra local files are not deleted; review obsolete files separately.
   To refresh only one skill instead of all bundled skills, use:

   ```sh
   musubix6 init . --only lean-sdd-tdd --force
   ```

5. Review the copied changes and restore any intentional local customizations
   from the backup. For a Git-managed project, inspect both tracked changes
   and newly copied files:

   ```sh
   git status --short -- .github/skills/
   git diff -- .github/skills/
   ```

   Run the project's normal checks. If it already uses SDD, run
   `musubix6 sdd gate` as well; copying skills alone does not initialize its
   `.sdd` specifications or evidence. Repeat the backup, refresh, and review
   steps for **every project** that has a copy of the skills.

### Update without a global install (npx)

Before using 0.2.0 features, check `npm view musubix6@0.2.0 version`.
`@latest` follows npm's current tag and may differ from this checkout's
0.2.0. Use the source checkout if registry access is unavailable.

Back up the target project's skills as above, then run these commands in its
root:

```sh
npx --yes musubix6@latest --version
npx --yes musubix6@latest init . --force
```

Review the changes as in step 5. This refreshes the copied skills but does not
update any separately installed global `musubix6` command. For the SDD gate
check, use `npx --yes musubix6@latest sdd gate` so that the selected version runs
instead of an older global CLI. To pin a version, replace `@latest` with
`@0.2.0` in every npx command, including the gate check.

### Update a source checkout

Run these commands inside the clone used for `npm install -g .` or `npm link`,
not inside an unrelated target project:

```sh
git pull --ff-only
npm install -g .
musubix6 --version
```

If Git reports local edits or a diverged branch, stop and reconcile them rather
than discarding changes. Then return to each target project, back up its skills,
and run `musubix6 init . --force`. Updating the source checkout does not
automatically refresh copies in other projects.

### Update per-user skills

Copies in `~/.copilot/skills/` also need a separate refresh. Update the global
CLI first, as shown above. If you have only used `npx`, install the chosen
version globally before using this copy procedure. Confirm the global package
root and the version of the actual copy source:

```sh
npm root -g
node "$(npm root -g)/musubix6/bin/musubix6.mjs" --version
```

The version must match the one you intend to copy. For an `npm link`
installation, the source is the linked checkout, not a downloaded npm release.

If `~/.copilot/skills/` already exists, back it up outside your project (Bash).
Skip this backup block if the directory does not exist yet:

```bash
user_backup_dir="$(mktemp -d "$HOME/musubix6-user-skills-backup.XXXXXX")"
cp -R "$HOME/.copilot/skills" "$user_backup_dir/skills"
printf 'Backup: %s\n' "$user_backup_dir"
```

After confirming the backup succeeded, copy the bundled skills:

```bash
mkdir -p "$HOME/.copilot/skills"
cp -R "$(npm root -g)/musubix6/.github/skills/." "$HOME/.copilot/skills/"
```

This overwrites matching bundled files; review your customizations afterward.
Do not use `musubix6 init ~/.copilot/skills` for this purpose: `init` appends
`.github/skills/` to its destination.

### Return to an earlier version

For example, to select the previous published CLI:

```sh
npm install -g musubix6@0.1.1
musubix6 --version
```

Downgrading the CLI does **not** undo changes to copied skills. Restore the
affected skill directories from your backup, or back up the current copies and
copy the selected version with `musubix6 init . --force`. Review and rerun the
project's checks afterward. Recopying an older version can leave files added by
a newer version; restore the backed-up skill directories if you need an exact
rollback. Do not reset project specifications or TDD evidence just to change
the skill version.

Locate your backup using the path printed as `Backup:` when it was created;
shell variables such as `$user_backup_dir` may no longer be set in a later
session. For per-user copies, restore the affected directories in
`~/.copilot/skills/` from the `skills` directory inside that backup. Merging
backup files can leave files introduced by a newer version in place; replace
the affected directories with their backed-up versions instead. Downgrading
the CLI does not restore per-user copies either.

## Tutorial

Start with the [Japanese mini-EC tutorial](docs/tutorial-mini-ec.md) for an introduction to musubix6, Copilot's role, EARS-style requirements and SDD/TDD. It also covers host differences, verification limits, natural-language development and parallel feature work with Git worktrees.

A Japanese walkthrough (interview → spec → TDD → follow-up feature → manual) is in [`docs/tutorial-app-development-1.md`](docs/tutorial-app-development-1.md).

## Tests

From the repository root, install the development-only diagnostic fixtures before
running the suite (Node ≥ 20, Python 3.14.x and installed cargo/rustc 1.99.x):

```sh
npm ci
python3.14 -m venv /tmp/musubix6-diagnostic-tools
/tmp/musubix6-diagnostic-tools/bin/python -m pip install -r scripts/diagnostics-tools.txt
export MUSUBIX_DIAGNOSTICS_TEST_VENV=/tmp/musubix6-diagnostic-tools
npm test
```

The runtime remains zero-dependency. Tests require the exact TypeScript 5.9.3
installation in `node_modules/typescript`; an explicit `SDD_R34_TYPESCRIPT`
directory overrides that default. A missing compiler fails the regression rather
than skipping it, and its per-command 15-second budget is unchanged.
The profile regressions also require the pinned Ruff/mypy venv and Rust toolchain;
missing prerequisites fail, never silently skip. Tests do not download tools.
Use your own private venv path instead of the example path when sharing a machine.

Install Python 3 with pytest and R for the required native controls. Other native
tests use their respective toolchains (C/C++ with CMake, Go, Cargo/Rust, JDK with
Maven, .NET, PHP with PHPUnit/Composer, Julia, and Elixir/OTP); unavailable optional
toolchains are reported as skips by the existing suite.
[`ci.yml`](.github/workflows/ci.yml) provisions these tools on Linux and runs the
full suite on Node 20/22/24, recording actual runtime versions and command exits
and uploading failure logs. The matrix is qualification infrastructure, not a
claim that every cell has already passed; it never publishes a package.

## AI cost log

`python3 scripts/cost-log.py` regenerates [`.sdd/cost-log.md`](.sdd/cost-log.md): the AI cost in USD (1 AIU = 0.01 USD) of every Copilot CLI session whose working directory is inside this project. It reads `~/.copilot/session-store.db`, so the total is cumulative across `/new` sessions and idempotent. Sessions run outside the project directory are not counted. It is a local estimate; the GitHub billing dashboard is authoritative. Do not edit the file by hand.

## Repository layout

```
.github/skills/
  agent-watchdog/       SKILL.md, scripts/watchdog.mjs (+ tests)
  lean-sdd-tdd/         SKILL.md, references/, scripts/sdd.mjs (+ tests)
  lean-agentic-coding/  SKILL.md, references/, scripts/gate.sh
  sdd-spec-interview/   SKILL.md
  tech-writer/          SKILL.md, references/doctypes/, assets/templates/, scripts/lint.py
  japanese-prose/       SKILL.md, references/, scripts/ (GiNZA), NOTICE.md
  wslc-containers/      SKILL.md, scripts/wslc.sh
```

## Acknowledgments

`tech-writer` and `japanese-prose` come from
[nahisaho/kotonoha](https://github.com/nahisaho/kotonoha) (MIT). The prose
diagnostics use [GiNZA](https://github.com/megagonlabs/ginza) (MIT),
[spaCy](https://spacy.io/) (MIT) and SudachiPy/SudachiDict (Apache-2.0).

## License

[MIT](LICENSE)
