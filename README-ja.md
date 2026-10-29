# musubix6

GitHub Copilot CLI と Claude Code 向けのエージェントスキル集です。
**軽量な仕様駆動(SDD)・テスト駆動(TDD)開発** と **日本語・英語の技術文書作成、課題分析、プレゼン資料の構成設計** を支援します。
Copilot は `.github/skills/`、Claude Code は `.claude/skills/` からスキルを読み込みます。

ソースが対象とする版は **0.2.0** です。導入前に、後述のコマンドで npm の公開状況を確認してください。
版番号だけでは、公開済みであることやリリース適格性を確認できません。
Claude の実セッションでのスキル検出と対話は、まだ確認していません。

[English](README.md) | [npm](https://www.npmjs.com/package/musubix6) | [変更履歴](CLANGELOG.md)

| スキル | 目的 |
|---|---|
| [`lean-sdd-tdd`](.github/skills/lean-sdd-tdd/SKILL.md) | REQ/TEST ID、Red→Green の証跡、ハッシュ固定した仕様、トレース検査、コンパクトな `gate` による、自走型の SDD/TDD 開発。依存なしのスクリプト `scripts/sdd.mjs` が規則を強制します。 |
| [`lean-agentic-coding`](.github/skills/lean-agentic-coding/SKILL.md) | リスク階層(T0〜T2)、コンテキスト予算、差分レビュー、コンパクトな gate により、厳密さを保ちながらトークンを節約します。 |
| [`sdd-spec-interview`](.github/skills/sdd-spec-interview/SKILL.md) | 1 問 1 答でヒアリングし、SDD の仕様(`.sdd/specs/<feature>.md`)を作成します。 |
| [`tech-writer`](.github/skills/tech-writer/SKILL.md) | README、設計書、テスト計画書、運用設計書、提案書、RFI/RFP、Qiita/Zenn 記事などの構成を整えます([kotonoha](https://github.com/nahisaho/kotonoha) 由来、MIT)。 |
| [`japanese-prose`](.github/skills/japanese-prose/SKILL.md) | GiNZA による日本語の診断・校正です。保護対象の内容が変わっていないかを検査し、修正内容に対応するハッシュ付きの意味レビューを求めます(kotonoha 由来、MIT)。 |
| [`consulting-analyst`](.github/skills/consulting-analyst/SKILL.md) | 文書やプレゼン資料を作る前に、判断すべき問い、論点、仮説、根拠、選択肢の比較を整理します(kotonoha 由来、MIT)。 |
| [`presentation-planner`](.github/skills/presentation-planner/SKILL.md) | プレゼン資料のシナリオ、スライド構成、デザイン仕様を設計します。PPTX ファイルは生成せず、専用スキルへ引き継ぎます(kotonoha 由来、MIT)。 |
| [`wslc-containers`](.github/skills/wslc-containers/SKILL.md) | Windows の組み込み WSL コンテナー CLI(`wslc.exe`)で、Docker Desktop なしに Linux コンテナーを操作します([wslc-containers-skill](https://github.com/nahisaho/wslc-containers-skill) 由来、MIT)。 |
| [`agent-watchdog`](.github/skills/agent-watchdog/SKILL.md) | 停止したバックグラウンドエージェントを検知します。読み取り専用の `watchdog.mjs` でワークスペースのアイドル時間を測り、`manage_schedule` の 5 分ごとのアイドルチェックで、未完了のまま Idle のエージェントを `list_agents` で見つけ、`write_agent` で続行を指示します。 |

## 必要なもの

| ツール | 用途 |
|---|---|
| Node.js 20 以上 | `lean-sdd-tdd`(`scripts/sdd.mjs`。`npm install` は不要) |
| Python 3.10 以上と **[uv](https://docs.astral.sh/uv/)** | `japanese-prose` の診断、`tech-writer` の lint |
| **[GiNZA](https://github.com/megagonlabs/ginza)**(`ginza`、`ja-ginza`、`spacy`) | `japanese-prose` の形態素・係り受け解析 |
| **[markdown-it-py](https://github.com/executablebooks/markdown-it-py)** | `japanese-prose` の編集前後の保護内容検査(`uv` がスクリプトの依存を解決) |
| 対象スタックのツールチェーン(任意) | `gate` / `tdd` はプロジェクト自身のテストランナーを実行します。Go、Cargo、JDK + Maven/Gradle、CMake、.NET、PHP、Julia など |

### uv のインストール

```sh
# Linux / macOS
curl -LsSf https://astral.sh/uv/install.sh | sh
# または: pipx install uv   /   brew install uv
uv --version
```

### GiNZA のインストール

通常、GiNZA を手動でインストールする必要はありません。
`japanese-prose` は、スクリプト内に依存関係を宣言しています(PEP 723)。
初回の `uv run` で、`ginza>=5.3.0,<5.4`、`ja-ginza>=5.3.0,<5.4`、`spacy>=3.8.16,<4` が
隔離環境に自動でインストールされます(初回はモデルのダウンロードで時間がかかります)。

GiNZA 5.3にはPython 3.10以降が必要です。開発元はPython 3.12を推奨しています。

```sh
uv run .github/skills/japanese-prose/scripts/lint.py path/to/document.md
```

仮想環境に手動でインストールする場合は、次のとおりです。

```sh
uv venv && source .venv/bin/activate
uv pip install "ginza>=5.3.0,<5.4" "ja-ginza>=5.3.0,<5.4" "spacy>=3.8.16,<4"
python .github/skills/japanese-prose/scripts/lint.py path/to/document.md
```

GiNZA がない場合、日本語の文章最適化は「未実施」として報告されます。
`tech-writer` の構造 lint は、`uv` がなくても次のコマンドで実行できます。
`python3 .github/skills/tech-writer/scripts/lint.py path/to/document.md`

GiNZA の依存関係とライセンスは [`NOTICE.md`](.github/skills/japanese-prose/NOTICE.md) を参照してください。

## 使い方

Copilot CLI は `.github/skills/`、Claude Code は `.claude/skills/` のスキルを読み込みます。
以降の例は Copilot 用です。Claude 側のスクリプトを直接実行する場合は、
パスを `.claude/skills/` に置き換えてください。
`musubix6 sdd` ラッパーはホスト共通です。自然な言葉で依頼できます。

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
名前は大文字・小文字を区別し、完全一致で照合します。複数指定すると抽出対象を統合します。
対象機能の仕様全文と、宣言された `artifacts`、`.sdd/plan.md` に記載した
前提機能を再帰的に抽出し、パスと SHA-256 を添えます。
ファイル指定では既存の `impact` を使い、変更の影響を受ける利用側の機能も含めます。
解析は静的でファイル単位です。宣言されていない関係は推測しないため、
関連する機能を明示的に追加してください。要約、永続キャッシュ、外部モデルは使いません。

既定の上限は、メタデータや JSON のエスケープを含む出力全体で **16384 UTF-8 バイト** です。
トークン数の推定値ではありません。上限を超えると本文を出さず、終了コード 2 で
必要なサイズと、最大 10 件の機能別サイズを返します。
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
走査の処理量やメモリー使用量ではありません。
抽出結果は検証や承認の証跡にはなりません。検証範囲は変えず、マージ前の全体 `gate` も維持します。

### 最終 gate の前にプロジェクトを診断する(v0.1.3)

この節では **0.1.3** の診断機能を説明します。0.1.2 には含まれません。
インストール前に `npm view musubix6@0.1.3 version` で公開状況を確認してください。
ソースのチェックアウトから CLI を導入することもできます。
編集済みのスキルをバックアップしてから、`musubix6 init . --force` でコピーを更新してください。
この操作はコピー済みスキルを上書きします。詳しい手順は後述します。

既定の `typescript` プロファイルには、`node_modules/typescript` の **5.9.x** と
`node_modules/eslint` の **ESLint 9.x**、ルートの `tsconfig.json` が必要です。
ルートに `eslint.config.js`・`eslint.config.mjs`・`eslint.config.cjs` のいずれか1つを用意し、
使用するプラグインやパーサーも事前に導入してください。
パッケージの symlink は使えますが、親ディレクトリやグローバルの導入先は参照しません。
依存が hoist 先にしかないワークスペースと Yarn PnP は未対応です。
`/path/to/project` を対象プロジェクトのディレクトリに置き換えて実行します。

```sh
musubix6 sdd diagnostics --root /path/to/project --json
# --json を省くと、人が読めるテキストで表示します。
musubix6 sdd diagnostics --root /path/to/project
# 言語を明示する場合。対象のツールは事前に導入してください。
musubix6 sdd diagnostics --root /path/to/project --profile javascript --json
musubix6 sdd diagnostics --root /path/to/project --profile python --json
musubix6 sdd diagnostics --root /path/to/project --profile rust --json
```

`--root` を省くと作業ディレクトリを使います。`--profile` の既定値は `typescript` で、言語の自動判定はしません。
`--help` は単独で指定してください。既定のプロファイルは、変更ファイルだけでなく、
tsconfig が選んだプロジェクト全体とコンパイラーの依存先を検査します。
JavaScript の型検査は `allowJs`・`checkJs` に従います。
ESLint は宣言ファイル以外のスクリプトを対象とし、ignore や未設定の拡張子を尊重します。
検査範囲はファイル件数で確認できます。
project references、`--changed`、モノレポの自動選択、LSP・IDE 接続は未対応です。

| プロファイル | 必要なツールと検査範囲 |
|---|---|
| `javascript` | ルートの ESLint 9.x と flat config 1つ。TypeScript と tsconfig は不要です。`.js/.jsx/.mjs/.cjs` を大文字小文字を区別せず再帰的に列挙し、`.git/node_modules/.venv` とディレクトリの symlink を除きます。native の ignore と設定のない入力も尊重します。 |
| `python` | ルートの `.venv` に Python 3.14.x、Ruff 0.17.1、mypy 2.4.0 が必要です。両ツールで全体の `.py/.pyi` を検査します。`.git/.venv` とディレクトリの symlink、native の除外を尊重し、mypy の files/modules/packages 指定は全体検査で置き換えます。Notebook や PATH・親・global のツールは使いません。 |
| `rust` | 導入済みの cargo/rustc 1.99.x、ルートの `Cargo.toml` と既存の `Cargo.lock`、単一のルート package が必要です。プロジェクト外に既存の Cargo home と offline 用の依存を用意します。`cargo check --all-targets --offline --locked` を既定の features で実行します。Clippy、全 features、複数 package の workspace は対象外です。 |

JavaScript・Python で候補を列挙するとき、除外ディレクトリの外で symlink のリンク先を確認できなければ、
拡張子を問わず当該ツールを未完了にします。切れたリンクも黙って無視しない保守的な制限です。

Python は起動時の `.pth`・`PYTHONPATH`・system-site-packages を使いません。
ルート設定の優先順は、Ruff が `.ruff.toml` → `ruff.toml` → `pyproject.toml[tool.ruff]`、
mypy が `mypy.ini` → `.mypy.ini` → `pyproject.toml[tool.mypy]` → `setup.cfg[mypy]` です。
共用設定に対応する section がなければ適用せず、構文が不正なら未完了にします。
設定がなければ隔離した既定値を使い、親や入れ子の設定は自動探索しません。
設定で明示した拡張先や import、plugin は信頼するコードとして扱います。

| 結果 | 終了コード | 意味 |
|---|---|---|
| PASS | 0 | 必須ツールがすべて完了し、error がない状態です。warning は表示します。 |
| FAIL | 1 | 必須ツールがすべて完了し、error がある状態です。 |
| INCOMPLETE | 2 | ツール・入力・設定などの問題で未完了です。問題なしとは扱いません。 |

取得できた error があっても、INCOMPLETE を優先します。
未導入、未対応版、設定やプラグインの不備、ESLint の検査対象なし、
全件 ignore、signal、不正な出力、実行上限の超過は成功ではありません。
時間の上限はツールごとに **60 秒**、cargo-check だけ **180 秒** です。
probe・入力選択・検査を通じて、native の標準出力と標準エラーを合計 **8 MiB** に制限します。
worker の通信出力にも、別に 8 MiB の上限があります。
報告された設定不備や静的エラーを修正して再実行してください。
失敗を無視して完了扱いにしないでください。

JSON には `schemaVersion: 1`、`profile`、解決済みの `root`、開始・終了時刻を含めます。
判定は `status`・`exitCode`・`reason` で表し、`snapshot: true` とツール別の結果も返します。
ツール別の結果には、バージョン・設定パス・完了状態・理由・ファイル件数と診断を含めます。
診断は `source`・`file`・1始まりの UTF-16 位置 `line`／`column`・`code`・`severity`・`message` で表します。
ファイル位置がない場合は null、未完了の件数も0ではなく null です。
TypeScript の検査件数にはコンパイラーの依存先も含むため、ESLint の件数とは合算しません。
Python の件数は直接の候補・選択済み・除外済みソースを表し、import 先は含みません。
ただし、import 先の診断は表示します。mypy は非 ASCII 行の列が不確かなため、
`column: null` と `info/location-unavailable` の通知を返します。
Rust は metadata の target root と観測できた root を重複なく数え、ignored は 0 です。
全 module や features の網羅数ではありません。早期エラー時には checked が included を下回る場合があります。

診断処理はツールの導入・ダウンロード、自動修正、診断のキャッシュ、TDD 履歴への追記を行いません。
Python の bytecode と Ruff・mypy の永続キャッシュも無効にします。
Rust の target と build の出力は、プロジェクト外に作る専用の一時領域へ向けます。
親プロセスが worker と通常の子孫プロセスを停止し、その領域を削除してから結果を返します。
削除に失敗した場合は INCOMPLETE です。
`CARGO_HOME`、未指定なら `~/.cargo` は、実体がプロジェクト外にある既存ディレクトリを使います。
相対パスはプロジェクトを基準に解決します。
通常の Cargo cache 管理ファイルや既存 archive の展開結果は残る場合があります。
対象には `.global-cache`・`.package-cache`・`.package-cache-mutate`・`registry/src` と registry のマーカーを含みます。
自動 cache GC は無効にし、プロジェクトの既存生成物は変更しません。
設定、plugin、build script、proc macro は信頼するローカルコードとして実行します。
任意の副作用やネットワーク利用を防ぐ sandbox ではありません。
親自身の SIGKILL、電源断、自己 detach した子孫の後始末も保証しません。
結果は実行時点の **スナップショット** であり、実行時の正しさ、TDD の Red／Green、
承認、リリース準備完了の証拠にはなりません。対象テストと最終の全体 `gate` は維持してください。
ローカルで確認した環境は Linux／Node 24 です。macOS／Windows は未確認です。
時間や AI コストがどれだけ減るかは未測定です。

### Claude Code または両ホストに導入する(v0.2.0)

新しいオプションは、npm の公開状況を確認してから導入した 0.2.0 の CLI、
または後述のソースからのインストールで利用できます。
0.1.x の npm 版では `--host` を使えません。

```sh
musubix6 init /path/to/project --host claude
musubix6 init /path/to/project --host both
# .claude/skills をバックアップしてからコピーを更新:
musubix6 init /path/to/project --host claude --force
```

| ホスト | コピー先 | スキル |
|---|---|---|
| `copilot`(既定) | `.github/skills/` | 全 10 件 |
| `claude` | `.claude/skills/` | `agent-watchdog` を除く共通 9 件 |
| `both` | 両方のディレクトリ | 各ホストに対応するセット |

`agent-watchdog` は **Copilot 専用** です。全件導入では、Claude 側の除外を stderr に表示します。
`--only agent-watchdog` と `--host claude` または `both` を組み合わせると、
どちらにも書き込まず、終了コード 2 で拒否します。
`--only lean-sdd-tdd,tech-writer` は両ホストの導入対象を絞ります。
既存ディレクトリはホストごとにスキップします。
`--force` は同梱ファイルを上書きしますが、追加されたローカルファイルは削除しません。
両ホストを更新する場合は、両方のディレクトリをバックアップし、差分を確認してください。

`--host`、`--only`、`--force` はコピー先の前後に指定できます。
値は空白で区切ってください。`--host=claude` 形式は使えません。
ホストの値がない場合や不明な場合、`--host` / `--only` の重複、不明なオプションやスキル、
複数のコピー先は、書き込み前に stderr と終了コード 2 で拒否します。
コピー中のファイルシステムエラーは通知しますが、ロールバックは保証しません。
`list` は Copilot 専用の watchdog も含めた同梱スキルを表示します。

Claude Code では `/lean-sdd-tdd`、または自然な言葉でスキルを呼び出せます。
質問・承認には各ホストのツールを使います。ツールがない場合は対話で明示的な回答を待ち、
承認を推測して記録しません。
`CLAUDE.md`、hooks、プラグイン設定、権限の自動付与は導入しません。
元の `.github/skills` から、同じスクリプトと補助ファイルをコピーします。
移設後のスクリプト確認は、Claude の実セッションでの検証を意味しません。
WSL コンテナーの実行、macOS / Windows は未検証です。

### 公開済みの npm パッケージをインストールする

次のコマンドでは、このソースと同じ **0.2.0** を指定します。
2026-10-27 時点で npm の 0.2.0 は取得可能で、`latest` は 0.2.2 でした。
この手順は `latest` ではなく、指定した版をインストールします。
Node.js 20 以上と npm を用意し、スキルを導入するプロジェクトで実行します。

まず取得可能かを確認してください。確認に失敗した場合は、表示されたレジストリーや
ネットワークの問題を解消するか、ソースから導入します。未公開とは限りません。

```sh
npm view musubix6@0.2.0 version
npm install -g musubix6@0.2.0
musubix6 --version
musubix6 init .
musubix6 list
```

グローバルにインストールしない場合は、`npx --yes musubix6@0.2.0 init .` を使います。
`init` は対象プロジェクトの `.github/skills/` にスキルをコピーします。

コピー先には相対パスと絶対パスを指定できます。省略すると作業ディレクトリを使います。
`--force` と `--only a,b` はコピー先の前後どちらにも指定できます。
不明なオプションや、値がない・空の `--only` は終了コード 2 で拒否し、
ファイルの作成や上書きは行いません。

変更点と既知の制限は [変更履歴](CLANGELOG.md) に記載しています。
npm への公開は、固定したマトリックスで行うリリース検証の完了を意味しません。

### ソースからのインストール(git clone)

公開済みの npm 版ではなく、開発用のチェックアウトを使う場合の手順です。

```sh
git clone https://github.com/nahisaho/musubix6.git
cd musubix6
npm install -g .               # または: npm link
musubix6 --version
musubix6 init ../my-project
musubix6 list
```

グローバルインストールは clone したディレクトリへのリンクになるため、
ディレクトリは削除しないでください。更新方法は次の節で説明します。
チェックアウトには、npm に未公開の変更が含まれる場合があります。
CLI の導入だけでは、別のプロジェクトへスキルはコピーされません。
上記の `init` は `../my-project` を作成し、既定の Copilot 用スキルを導入します。
コピー先は対象プロジェクトのパスに置き換えてください。
Claude 用には `--host claude`、両方には `--host both` を加えます。

2026-10-27 に Linux、Node 24.22.1、npm 11.19.1 で、`/tmp/musubix6` への導入を確認しました。
共用のグローバル CLI を変更しないよう、npm のグローバル導入先を隔離しました。
指定版の npm 導入、npx、ソースからの導入は成功し、Copilot 側に 10 件、Claude 側に 9 件のスキルを配置できました。
導入済みの SDD ラッパーと `tech-writer` の lint、`uv run` で依存を解決した GiNZA の lint も実行できました。
この確認は、Copilot / Claude の実セッションでのスキル検出や、リリース適格性を保証しません。

## CLI と導入済みスキルの更新方法

更新は **CLI** と **プロジェクトごとのスキル** の 2 段階で行います。
`npm install -g` だけでは、コピー済みの `.github/skills/` や `.claude/skills/` は更新されません。
以降は既定の Copilot 用手順です。v0.2.0 で Claude 側を更新する場合は、
`.claude/skills/` をバックアップしてから `--host claude` を加え、更新後に差分を確認してください。
`--host both` では、両方のディレクトリをバックアップし、差分を確認します。

### npm で導入したプロジェクトを更新する

1. 現在の CLI と、npm に公開されているバージョンを確認します。

   ```sh
   musubix6 --version
   npm view musubix6 version
   ```

2. 上書きする前に、対象プロジェクトのルートで `.github/skills/` をバックアップします。
   次の Bash の例は Linux、macOS、WSL で使えます。
   通常のプロジェクト配下を避け、ホームディレクトリ直下に保存します。

   ```bash
   backup_dir="$(mktemp -d "$HOME/musubix6-skills-backup.XXXXXX")"
   cp -R .github/skills "$backup_dir/skills"
   printf 'Backup: %s\n' "$backup_dir"
   ```

   更新内容の確認が終わるまで、表示された保存先にバックアップを残してください。
   まだ `.github/skills/` がない場合は、上記のインストール手順を使います。

3. グローバルの CLI を最新版に更新します。

   ```sh
   npm install -g musubix6@latest
   musubix6 --version
   ```

   特定の版にそろえる場合は、`npm install -g musubix6@0.2.0` のように指定します。
   この段階では、各プロジェクトのファイルは上書きされません。

4. 対象プロジェクトのルートで、同梱スキルをコピーし直します。

   ```sh
   musubix6 init . --force
   ```

   `--force` を付けないと、既存のスキルは更新されずにスキップされます。
   付けた場合は同梱ファイルを上書きします。ローカルの編集内容とはマージしません。
   ローカルにだけある追加ファイルは削除しないため、不要になったファイルは別途確認してください。
   すべてではなく、特定のスキルだけを更新する場合は次のように指定します。

   ```sh
   musubix6 init . --only lean-sdd-tdd --force
   ```

5. コピー後の差分を確認し、残したい独自の変更をバックアップから反映します。
   Git で管理している場合は、追跡済みファイルの変更と、新しくコピーしたファイルを確認します。

   ```sh
   git status --short -- .github/skills/
   git diff -- .github/skills/
   ```

   プロジェクトで通常使う検証を実行してください。
   すでに SDD を使っている場合は、`musubix6 sdd gate` も実行します。
   スキルをコピーするだけでは、`.sdd` の仕様や証跡は初期化されません。
   導入済みの **すべてのプロジェクト** で、
   バックアップ、コピー、確認を繰り返してください。

### グローバル導入せずに更新する(npx)

0.2.0 の機能を使う前に、`npm view musubix6@0.2.0 version` で公開状況を確認してください。
`@latest` は npm の現在のタグに従うため、このソースの 0.2.0 と異なる版になる場合があります。
レジストリーへ接続できない場合は、ソースから導入してください。

上記と同じ方法でスキルをバックアップし、対象プロジェクトのルートで実行します。

```sh
npx --yes musubix6@latest --version
npx --yes musubix6@latest init . --force
```

コピー後は手順 5 と同じ確認を行ってください。
この方法では、別途インストールしてあるグローバルの `musubix6` は更新しません。
SDD のゲート検証にも、`npx --yes musubix6@latest sdd gate` を使ってください。
古いグローバル CLI ではなく、指定した版で検証できます。
特定の版を使う場合は、ゲート検証も含め、各コマンドの `@latest` を `@0.2.0` に置き換えます。

### ソースから導入した場合に更新する

ソースを clone したディレクトリで実行します。
これは、導入時に `npm install -g .` または `npm link` を実行した場所です。
スキルのコピー先になっている別のプロジェクトでは実行しないでください。

```sh
git pull --ff-only
npm install -g .
musubix6 --version
```

Git がローカルの変更やブランチの分岐を報告した場合は、
変更を捨てずに内容を確認して解消してください。
その後、各プロジェクトに戻ってスキルをバックアップし、
`musubix6 init . --force` を実行します。
ソースを更新しても、ほかのプロジェクトにコピーしたスキルは自動では更新されません。

### ユーザー単位で導入したスキルを更新する

`~/.copilot/skills/` にコピーした場合も、別途更新が必要です。
まず、前述の手順でグローバルの CLI を更新してください。
`npx` だけを使っていた場合は、このコピー手順を使う前に、選んだ版をグローバルにインストールします。
グローバルパッケージの配置先と、コピー元にある CLI のバージョンを確認します。

```sh
npm root -g
node "$(npm root -g)/musubix6/bin/musubix6.mjs" --version
```

コピーしたい版と一致していることを確認してください。
`npm link` で導入している場合、コピー元は npm から取得した公開版ではなく、リンク先のソースです。

`~/.copilot/skills/` が既にある場合は、プロジェクトの外にバックアップします(Bash)。
まだない場合は、次のバックアップ用コードを省略してください。

```bash
user_backup_dir="$(mktemp -d "$HOME/musubix6-user-skills-backup.XXXXXX")"
cp -R "$HOME/.copilot/skills" "$user_backup_dir/skills"
printf 'Backup: %s\n' "$user_backup_dir"
```

既存のディレクトリがある場合は、バックアップの成功を確認してください。
その後、同梱スキルをコピーします。

```bash
mkdir -p "$HOME/.copilot/skills"
cp -R "$(npm root -g)/musubix6/.github/skills/." "$HOME/.copilot/skills/"
```

同名の同梱ファイルを上書きするため、コピー後に独自の変更を確認してください。
この用途に `musubix6 init ~/.copilot/skills` は使わないでください。
`init` は指定したコピー先に `.github/skills/` を付加します。

### 以前のバージョンに戻す

たとえば、CLI を前の公開版に戻す場合は次のように指定します。

```sh
npm install -g musubix6@0.1.1
musubix6 --version
```

CLI を戻しても、コピー済みスキルへの変更は **元に戻りません**。
対象のスキルをバックアップから復元してください。
または、現在のコピーを退避してから、選んだ版の `musubix6 init . --force` でコピーし直します。
ただし、この方法では新しい版で増えたファイルが残る場合があります。
完全に元へ戻す必要がある場合は、バックアップしたスキルのディレクトリを復元してください。
その後、差分の確認とプロジェクトの検証を行ってください。
スキルの版を戻すために、プロジェクトの仕様や TDD 証跡をリセットする必要はありません。

バックアップは、作成時に `Backup:` として表示されたパスから探してください。
別のシェルや後日の作業では、`$user_backup_dir` などの変数が残っているとは限りません。
ユーザー単位のコピーを戻す場合は、バックアップ内の `skills` から
`~/.copilot/skills/` 内の対象スキルを復元してください。
バックアップをマージするだけでは、新しい版で追加されたファイルは削除されません。
対象のディレクトリをバックアップで置き換えて復元してください。
CLI を以前の版に戻しても、ユーザー単位のコピーは元に戻りません。

## チュートリアル

musubix6が初めての方は、[ミニECを作り、Worktreeで機能を追加するチュートリアル](docs/tutorial-mini-ec.md)から始められます。Copilotとmusubix6の役割、自然言語からEARS形式への要件定義、SDD/TDDによる開発を説明しています。Copilot CLI版とClaude Code版の違い、Worktreeでの並列開発も扱います。

要件定義から追加開発、マニュアル作成までの手順は [`docs/tutorial-app-development-1.md`](docs/tutorial-app-development-1.md) を参照してください。

## テスト

Node ≥ 20、Python 3.14.x、導入済みの cargo/rustc 1.99.x を用意してください。
リポジトリのルートで、診断テスト用の開発依存をインストールしてから実行します。

```sh
npm ci
python3.14 -m venv /tmp/musubix6-diagnostic-tools
/tmp/musubix6-diagnostic-tools/bin/python -m pip install -r scripts/diagnostics-tools.txt
export MUSUBIX_DIAGNOSTICS_TEST_VENV=/tmp/musubix6-diagnostic-tools
npm test
```

実行時の依存パッケージはありません。テストには `node_modules/typescript` の
TypeScript 5.9.3 が必要です。別のインストール先を使う場合は、ディレクトリを
`SDD_R34_TYPESCRIPT` で指定できます。コンパイラーがなければ回帰テストは失敗し、
スキップしません。コマンドごとの上限は従来どおり 15 秒です。
追加プロファイルの回帰テストには、上記の固定版 Ruff・mypy と Rust も必須です。
前提ツールがなければ失敗し、黙ってスキップしたり自動取得したりはしません。
共有環境では、例の `/tmp` パスを自分専用の venv に置き換えてください。

必須のネイティブ実行テストには Python 3 と pytest、R を用意してください。
ほかのネイティブテストには、対象に応じたツールチェーンが必要です。
対象は C/C++ と CMake、Go、Cargo/Rust、JDK と Maven です。
.NET、PHP と PHPUnit/Composer、Julia、Elixir/OTP も対象です。
任意のツールチェーンがない場合、そのツールを使う既存のテストはスキップとして報告されます。
[`ci.yml`](.github/workflows/ci.yml) は Linux 上でこれらを用意し、Node 20/22/24 で
全テストを実行します。各コマンドの終了コードとランタイムのバージョンを記録します。
失敗時にはログも保存します。このマトリックスは検証用の基盤であり、全構成での合格を
保証するものではありません。パッケージの公開は行いません。

## AI コストログ

`python3 scripts/cost-log.py` で [`.sdd/cost-log.md`](.sdd/cost-log.md) を再生成します。
集計対象は、作業ディレクトリがこのプロジェクト配下にある Copilot CLI の全セッションです。
AI コストは USD(1 AIU = 0.01 USD)で記録します。

`~/.copilot/session-store.db` を参照するため、`/new` でセッションを変えてもコストは累積されます。
何度実行しても結果は同じです。プロジェクトの外で動かしたセッションは対象外です。

金額はローカルでの概算です。正式な金額は GitHub の請求ダッシュボードで確認してください。
このファイルは手で編集しないでください。

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
