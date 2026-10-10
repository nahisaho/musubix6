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

To install per-user instead of per repository, copy the skill directories to
`~/.copilot/skills/`.

## Tests

```sh
node --test .github/skills/lean-sdd-tdd/scripts/sdd.test.mjs
```

## Dogfooding

`dogfood-7/` contains real applications (JS/TS, Python, Go,
Rust, Java, C/C++, PHP, C#, Julia) built with `lean-sdd-tdd` to find defects in
the skill itself. Findings and minimal reproductions are under
`dogfood-*/findings/`; each defect is filed as a GitHub issue and fixed with a
regression test in `sdd.test.mjs`.

## Repository layout

```
.github/skills/
  lean-sdd-tdd/         SKILL.md, references/, scripts/sdd.mjs (+ tests)
  lean-agentic-coding/  SKILL.md, references/, scripts/gate.sh
  sdd-spec-interview/   SKILL.md
  tech-writer/          SKILL.md, references/doctypes/, assets/templates/, scripts/lint.py
  japanese-prose/       SKILL.md, references/, scripts/ (GiNZA), NOTICE.md
  wslc-containers/      SKILL.md, scripts/wslc.sh
dogfood-7/             dogfooding apps and findings
```

## Acknowledgments

`tech-writer` and `japanese-prose` come from
[nahisaho/kotonoha](https://github.com/nahisaho/kotonoha) (MIT). The prose
diagnostics use [GiNZA](https://github.com/megagonlabs/ginza) (MIT),
[spaCy](https://spacy.io/) (MIT) and SudachiPy/SudachiDict (Apache-2.0).
