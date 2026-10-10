# musubix6

[English](README.md)

**軽量な仕様駆動(SDD)・テスト駆動(TDD)開発**と、**日本語・英語の技術文書作成**のための
エージェントスキル集です。GitHub Copilot CLI(`.github/skills/`)向けです。

| スキル | 目的 |
|---|---|
| [`lean-sdd-tdd`](.github/skills/lean-sdd-tdd/SKILL.md) | REQ/TEST ID、Red→Green の証跡、ハッシュ固定した仕様、トレース検査、コンパクトな `gate` による、自走型の SDD/TDD 開発。依存なしのスクリプト `scripts/sdd.mjs` が規則を強制します。 |
| [`lean-agentic-coding`](.github/skills/lean-agentic-coding/SKILL.md) | リスク階層(T0〜T2)、コンテキスト予算、差分レビュー、コンパクトな gate により、厳密さを保ちながらトークンを節約します。 |
| [`sdd-spec-interview`](.github/skills/sdd-spec-interview/SKILL.md) | 1 問 1 答でヒアリングし、SDD の仕様(`.sdd/specs/<feature>.md`)を作成します。 |
| [`tech-writer`](.github/skills/tech-writer/SKILL.md) | README、設計書、テスト計画書、運用設計書、提案書、RFI/RFP、Qiita/Zenn 記事などの構成を整えます([kotonoha](https://github.com/nahisaho/kotonoha) 由来、MIT)。 |
| [`japanese-prose`](.github/skills/japanese-prose/SKILL.md) | GiNZA による日本語の診断です。自然さ、読みやすさ、用語、AI 特有の定型表現を調べます(kotonoha 由来、MIT)。 |
| [`wslc-containers`](.github/skills/wslc-containers/SKILL.md) | Windows の組み込み WSL コンテナー CLI(`wslc.exe`)で、Docker Desktop なしに Linux コンテナーを操作します([wslc-containers-skill](https://github.com/nahisaho/wslc-containers-skill) 由来、MIT)。 |

## 必要なもの

| ツール | 用途 |
|---|---|
| Node.js 20 以上 | `lean-sdd-tdd`(`scripts/sdd.mjs`。`npm install` は不要) |
| Python 3.10 以上と **[uv](https://docs.astral.sh/uv/)** | `japanese-prose` の診断、`tech-writer` の lint |
| **[GiNZA](https://github.com/megagonlabs/ginza)**(`ginza`、`ja-ginza`、`spacy`) | `japanese-prose` の形態素・係り受け解析 |
| 対象スタックのツールチェーン(任意) | `gate` / `tdd` はプロジェクト自身のテストランナーを実行します。Go、Cargo、JDK + Maven/Gradle、CMake、.NET、PHP、Julia など |

### uv のインストール

```sh
# Linux / macOS
curl -LsSf https://astral.sh/uv/install.sh | sh
# または: pipx install uv   /   brew install uv
uv --version
```

### GiNZA のインストール

通常、GiNZA を手動でインストールする必要はありません。`japanese-prose` のスクリプトは
依存関係を inline(PEP 723)で宣言しているため、初回の `uv run` が
`ginza>=5.2.0,<5.3`、`ja-ginza>=5.2.0,<5.3`、`spacy>=3.8.0,<4` を
隔離環境に自動で解決します(初回はモデルのダウンロードで時間がかかります)。

```sh
uv run .github/skills/japanese-prose/scripts/lint.py path/to/document.md
```

仮想環境に手動でインストールする場合は、次のとおりです。

```sh
uv venv && source .venv/bin/activate
uv pip install "ginza>=5.2.0,<5.3" "ja-ginza>=5.2.0,<5.3" "spacy>=3.8.0,<4"
python .github/skills/japanese-prose/scripts/lint.py path/to/document.md
```

GiNZA がない場合、日本語の文章最適化は「未実施」として報告されます。
`tech-writer` の構造 lint は、`uv` がなくても使えます。
`python3 .github/skills/tech-writer/scripts/lint.py path/to/document.md`
GiNZA の依存関係とライセンスは [`NOTICE.md`](.github/skills/japanese-prose/NOTICE.md) を参照してください。

## 使い方

Copilot CLI は `.github/skills/` のスキルを自動で読み込みます。自然な言葉で依頼してください。

- 「API にレート制限を追加して」→ `lean-sdd-tdd`(仕様 → Red → Green → gate)
- 「〜を作りたい」→ `sdd-spec-interview` が先に仕様を作成します
- 「設計ドキュメントを作って」「テスト計画書を作って」→ `tech-writer`

SDD スクリプトを直接実行する場合は、次のとおりです。

```sh
S="node .github/skills/lean-sdd-tdd/scripts/sdd.mjs"
$S --root <app> init
$S --root <app> tdd red TEST-F-001
$S --root <app> tdd green TEST-F-001
$S --root <app> gate
```

リポジトリ単位ではなくユーザー単位で使う場合は、スキルのディレクトリを
`~/.copilot/skills/` にコピーしてください。

## テスト

```sh
node --test .github/skills/lean-sdd-tdd/scripts/sdd.test.mjs
```

## ドッグフーディング

`dogfood-7/` には、`lean-sdd-tdd` でスキル自体の不具合を見つけるために作った、
実アプリケーション(JS/TS、Python、Go、Rust、Java、C/C++、PHP、C#、Julia)があります。
見つかった指摘と最小の再現例は `dogfood-*/findings/` にあります。不具合は GitHub Issue に登録し、
`sdd.test.mjs` に回帰テストを追加して修正しています。

## リポジトリ構成

```
.github/skills/
  lean-sdd-tdd/         SKILL.md、references/、scripts/sdd.mjs(とテスト)
  lean-agentic-coding/  SKILL.md、references/、scripts/gate.sh
  sdd-spec-interview/   SKILL.md
  tech-writer/          SKILL.md、references/doctypes/、assets/templates/、scripts/lint.py
  japanese-prose/       SKILL.md、references/、scripts/(GiNZA)、NOTICE.md
  wslc-containers/      SKILL.md、scripts/wslc.sh
dogfood-7/             ドッグフーディング用アプリと指摘
```

## 謝辞

`tech-writer` と `japanese-prose` は [nahisaho/kotonoha](https://github.com/nahisaho/kotonoha)(MIT)由来です。
文章診断には [GiNZA](https://github.com/megagonlabs/ginza)(MIT)、[spaCy](https://spacy.io/)(MIT)、
SudachiPy/SudachiDict(Apache-2.0)を使っています。
