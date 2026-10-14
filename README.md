# musubix6

[日本語](README-ja.md)

Agent skills for **lean, spec-driven and test-driven development** and for
**technical writing in Japanese and English**, packaged for GitHub Copilot CLI
(`.github/skills/`).

| Skill | Purpose |
|---|---|
| [`lean-sdd-tdd`](.github/skills/lean-sdd-tdd/SKILL.md) | Autonomous spec-driven (SDD) and test-driven (TDD) development with REQ/TEST IDs, Red→Green proof, hash-locked specs, trace check and a compact `gate`. Backed by the zero-dependency script `scripts/sdd.mjs`. |
| [`lean-agentic-coding`](.github/skills/lean-agentic-coding/SKILL.md) | Risk tiers (T0–T2), context budget, delta review and a compact gate to cut token usage while keeping rigor. |
| [`sdd-spec-interview`](.github/skills/sdd-spec-interview/SKILL.md) | Interviews the user one question at a time and writes the SDD spec (`.sdd/specs/<feature>.md`). |
| [`tech-writer`](.github/skills/tech-writer/SKILL.md) | Structures README, design docs, test plans, runbooks, proposals, RFI/RFP, Qiita/Zenn articles and more (from [kotonoha](https://github.com/nahisaho/kotonoha), MIT). |
| [`japanese-prose`](.github/skills/japanese-prose/SKILL.md) | GiNZA-based Japanese prose diagnostics: naturalness, reading load, terminology, AI-like patterns (from kotonoha, MIT). |
| [`wslc-containers`](.github/skills/wslc-containers/SKILL.md) | Operate Linux containers on Windows via the built-in WSL container CLI (`wslc.exe`), without Docker Desktop (from [wslc-containers-skill](https://github.com/nahisaho/wslc-containers-skill), MIT). |
| [`agent-watchdog`](.github/skills/agent-watchdog/SKILL.md) | Detects stalled background agents (read-only `watchdog.mjs` for workspace idle time, plus a 5-minute scheduled idle check via `manage_schedule` that finds Idle agents with unfinished work with `list_agents` and resumes them with `write_agent`). |

## Requirements

| Tool | Needed for |
|---|---|
| Node.js ≥ 20 | `lean-sdd-tdd` (`scripts/sdd.mjs`, no `npm install`) |
| Python ≥ 3.10 and **[uv](https://docs.astral.sh/uv/)** | `japanese-prose` diagnostics and `tech-writer` lint |
| **[GiNZA](https://github.com/megagonlabs/ginza)** (`ginza`, `ja-ginza`, `spacy`) | `japanese-prose` morphological/dependency analysis |
| Target stack toolchains (optional) | `gate`/`tdd` run the project's own test runner: Go, Cargo, JDK + Maven/Gradle, CMake, .NET, PHP, Julia, … |

### Install uv

```sh
# Linux / macOS
curl -LsSf https://astral.sh/uv/install.sh | sh
# or: pipx install uv   /   brew install uv
uv --version
```

### Install GiNZA

You normally do **not** install GiNZA by hand. The `japanese-prose` scripts
declare their dependencies inline (PEP 723), so `uv run` resolves
`ginza>=5.2.0,<5.3`, `ja-ginza>=5.2.0,<5.3` and `spacy>=3.8.0,<4` into an
isolated environment on first use (the first run downloads the model and
takes a while):

```sh
uv run .github/skills/japanese-prose/scripts/lint.py path/to/document.md
```

To install it manually into a virtual environment instead:

```sh
uv venv && source .venv/bin/activate
uv pip install "ginza>=5.2.0,<5.3" "ja-ginza>=5.2.0,<5.3" "spacy>=3.8.0,<4"
python .github/skills/japanese-prose/scripts/lint.py path/to/document.md
```

Without GiNZA the prose pass is reported as not performed; the structural
lint of `tech-writer` still works without `uv`:
`python3 .github/skills/tech-writer/scripts/lint.py path/to/document.md`.
GiNZA dependency and license details: [`NOTICE.md`](.github/skills/japanese-prose/NOTICE.md).

## Usage

Copilot CLI loads the skills from `.github/skills/` automatically. Ask in
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

### Install from npm

```bash
npm install -g musubix6        # or: npx musubix6 init
musubix6 init [dir]            # copy skills into <dir>/.github/skills (--force, --only a,b)
musubix6 list                  # bundled skills
musubix6 sdd gate              # run the lean-sdd-tdd CLI
```

`init` accepts a relative or absolute destination; omitting it uses the current
directory. `--force` and `--only a,b` can appear before or after the destination.
Unknown options or a missing/empty `--only` skill list exit with status 2 without
creating or overwriting files.

To install per-user instead of per repository, copy the skill directories to
`~/.copilot/skills/`.

## Tutorial

A Japanese walkthrough (interview → spec → TDD → follow-up feature → manual) is in [`docs/tutorial-app-development-1.md`](docs/tutorial-app-development-1.md).

## Tests

From the repository root, install the development-only compiler fixture before
running the suite (Node ≥ 20):

```sh
npm ci
node --test .github/skills/lean-sdd-tdd/scripts/sdd.test.mjs
```

The runtime remains zero-dependency. Tests require the exact TypeScript 5.9.3
installation in `node_modules/typescript`; an explicit `SDD_R34_TYPESCRIPT`
directory overrides that default. A missing compiler fails the regression rather
than skipping it, and its per-command 15-second budget is unchanged.

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
