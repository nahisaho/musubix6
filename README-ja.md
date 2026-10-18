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
| [`agent-watchdog`](.github/skills/agent-watchdog/SKILL.md) | 停止したバックグラウンドエージェントを検知します。読み取り専用の `watchdog.mjs` でワークスペースのアイドル時間を測り、`manage_schedule` の 5 分ごとのアイドルチェックで、未完了のまま Idle のエージェントを `list_agents` で見つけ、`write_agent` で続行を指示します。 |

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

### 変更に必要な仕様だけを読む(v0.1.2)

全要件をエージェントに読み込ませる代わりに、`context` で対象の仕様を抽出します。

```sh
node .github/skills/lean-sdd-tdd/scripts/sdd.mjs context spec-context
# musubix6 のインストール後はラッパー経由でも実行できます。
musubix6 sdd context REQ-SPECCTX-001 --json
# 対象プロジェクトでは、実在するソースファイルのパスに置き換えてください。
musubix6 sdd context src/example.mjs --max-bytes 32768
```

機能名、REQ ID、仕様ファイルのパス、既存ファイルのパスで指定します。
名前は大文字・小文字を区別する完全一致です。複数指定すると抽出対象を統合します。
対象機能の仕様全文と、宣言された `artifacts`、`.sdd/plan.md` に記載した
前提機能を再帰的に抽出し、パスと SHA-256 を添えます。
ファイル指定では既存の `impact` を使い、変更の影響を受ける利用側の機能も含めます。
解析は静的でファイル単位です。宣言されていない関係は推測しないため、
関連する機能を明示的に追加してください。要約、永続キャッシュ、外部モデルは使いません。

既定の上限は、メタデータや JSON のエスケープを含む出力全体で **16384 UTF-8 バイト** です。
トークン数の推定値ではありません。上限を超えると本文を出さず、終了コード2で
必要サイズと最大10件の機能別サイズを返します。
対象を絞るか、`--max-bytes` で上限を明示的に変更してください。
不明・曖昧な指定、前提仕様や添付ファイルの欠落、定義の重複、依存の循環、
プロジェクト外のパスもエラーにし、部分的な成功として扱いません。

`--root DIR` で対象プロジェクトを選べます。既定は作業ディレクトリです。
`context --changed` は Git のステージ済み・未ステージ・未追跡の変更を使います。
すべての変更ファイルから要件を特定できる必要があります。
変更がない場合、削除済み・要件不明のファイルがある場合、Git が使えない場合は
エラーになります。代わりに機能名や REQ ID を指定してください。
同梱の SDD スキルにも、この読み込み手順を組み込んでいます。
リポジトリの走査はローカルで行います。削減するのはエージェントへの入力であり、
走査やメモリーの使用量ではありません。
抽出結果は検証や承認の証跡にはなりません。検証範囲は変えず、マージ前の全体 `gate` も維持します。

### ソースからのインストール(git clone)

現時点では npm に公開していないため、リポジトリを clone してローカルからインストールします(Node.js 20 以上)。

```sh
git clone https://github.com/nahisaho/musubix6.git
cd musubix6
npm install -g .               # または: npm link
musubix6 --version
```

グローバルインストールは clone したディレクトリへのリンクになるため、ディレクトリは削除しないでください。更新は clone 内で `git pull` します。
`musubix6 init [dir]`(スキルのコピー)、`musubix6 list`、`musubix6 sdd gate` が使えます。

## チュートリアル

要件定義から追加開発、マニュアル作成までの手順は [`docs/tutorial-app-development-1.md`](docs/tutorial-app-development-1.md) を参照してください。

## テスト

リポジトリのルートで、テスト専用のコンパイラーをインストールしてから実行します(Node ≥ 20)。

```sh
npm ci
npm test
```

実行時の依存パッケージはありません。テストには `node_modules/typescript` の
TypeScript 5.9.3 が必要です。別のインストール先を使う場合は、ディレクトリを
`SDD_R34_TYPESCRIPT` で指定できます。コンパイラーがなければ回帰テストは失敗し、
スキップしません。コマンドごとの上限は従来どおり 15 秒です。

必須のネイティブ実行テストには Python 3 と pytest、R を用意してください。
ほかのネイティブテストには、対象に応じたツールチェーンが必要です。
対象は C/C++ と CMake、Go、Cargo/Rust、JDK と Maven です。
.NET、PHP と PHPUnit/Composer、Julia、Elixir/OTP も対象です。
任意のツールチェーンがない場合は、既存のテストがスキップとして報告します。
[`ci.yml`](.github/workflows/ci.yml) は Linux 上でこれらを用意し、Node 20/22/24 で
全テストを実行します。各コマンドの終了コードとランタイムのバージョンを記録します。
失敗時にはログも保存します。このマトリックスは検証用の基盤であり、全構成での合格を
保証するものではありません。パッケージの公開は行いません。

## AI コストログ

`python3 scripts/cost-log.py` で [`.sdd/cost-log.md`](.sdd/cost-log.md) を再生成します。作業ディレクトリがこのプロジェクト配下にある Copilot CLI セッションすべての AI コストを USD(1 AIU = 0.01 USD)で記録します。`~/.copilot/session-store.db` を読むため、`/new` でセッションを変えても累積され、何度実行しても結果は同じです。プロジェクトの外で動かしたセッションは対象外です。ローカルでの概算なので、正式な金額は GitHub の請求ダッシュボードで確認してください。このファイルは手で編集しないでください。

## リポジトリ構成

```
.github/skills/
  agent-watchdog/       SKILL.md、scripts/watchdog.mjs(とテスト)
  lean-sdd-tdd/         SKILL.md、references/、scripts/sdd.mjs(とテスト)
  lean-agentic-coding/  SKILL.md、references/、scripts/gate.sh
  sdd-spec-interview/   SKILL.md
  tech-writer/          SKILL.md、references/doctypes/、assets/templates/、scripts/lint.py
  japanese-prose/       SKILL.md、references/、scripts/(GiNZA)、NOTICE.md
  wslc-containers/      SKILL.md、scripts/wslc.sh
```

## 謝辞

`tech-writer` と `japanese-prose` は [nahisaho/kotonoha](https://github.com/nahisaho/kotonoha)(MIT)由来です。
文章診断には [GiNZA](https://github.com/megagonlabs/ginza)(MIT)、[spaCy](https://spacy.io/)(MIT)、
SudachiPy/SudachiDict(Apache-2.0)を使っています。
