# musubix6

GitHub Copilot CLI 向けのエージェントスキル集です。
**軽量な仕様駆動(SDD)・テスト駆動(TDD)開発** と **日本語・英語の技術文書作成** を支援します。
スキルは `.github/skills/` から読み込まれます。

[English](README.md) | [npm v0.1.2](https://www.npmjs.com/package/musubix6/v/0.1.2) | [変更履歴](CLANGELOG.md)

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

通常、GiNZA を手動でインストールする必要はありません。
`japanese-prose` は、スクリプト内に依存関係を宣言しています(PEP 723)。
初回の `uv run` で、`ginza>=5.2.0,<5.3`、`ja-ginza>=5.2.0,<5.3`、`spacy>=3.8.0,<4` が
隔離環境に自動でインストールされます(初回はモデルのダウンロードで時間がかかります)。

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
`tech-writer` の構造 lint は、`uv` がなくても次のコマンドで実行できます。
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

### 最終 gate の前に TypeScript を診断する(開発版)

この機能は開発用チェックアウトで利用できます。**公開済みの 0.1.2 には含まれません**。
チェックアウトから CLI を導入するか、同梱の SDD スクリプトを直接実行してください。
コピー済みスキルの更新は、後述の手順で別途行います。

対象プロジェクトには、`node_modules/typescript` の **5.9.x** と
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
```

`--root` を省くと作業ディレクトリを使います。`--help` は単独で指定してください。
変更ファイルだけでなく、tsconfig が選んだプロジェクト全体とコンパイラーの依存先を検査します。
JavaScript の型検査は `allowJs`・`checkJs` に従います。
ESLint は宣言ファイル以外のスクリプトを対象とし、ignore や未設定の拡張子を尊重します。
検査範囲はファイル件数で確認できます。
project references、`--changed`、モノレポの自動選択、LSP・IDE 接続は未対応です。

| 結果 | 終了コード | 意味 |
|---|---|---|
| PASS | 0 | 両ツールが完了し、error がない状態です。warning は表示します。 |
| FAIL | 1 | 両ツールが完了し、error がある状態です。 |
| INCOMPLETE | 2 | ツール・入力・設定などの問題で未完了です。問題なしとは扱いません。 |

取得できた error があっても、INCOMPLETE を優先します。
未導入、未対応版、設定やプラグインの不備、ESLint の検査対象なし、
全件 ignore、signal、不正な出力、実行上限の超過は成功ではありません。
上限はツールごとに設定読み込みを含めて **60 秒**、標準出力と標準エラーの合計 **8 MiB** です。
報告された設定不備や静的エラーを修正して再実行してください。
失敗を無視して完了扱いにしないでください。

JSON には `schemaVersion: 1`、`profile`、解決済みの `root`、開始・終了時刻を含めます。
判定は `status`・`exitCode`・`reason` で表し、`snapshot: true` とツール別の結果も返します。
ツール別の結果には、バージョン・設定パス・完了状態・理由・ファイル件数と診断を含めます。
診断は `source`・`file`・1始まりの UTF-16 位置 `line`／`column`・`code`・`severity`・`message` で表します。
ファイル位置がない場合は null、未完了の件数も0ではなく null です。
TypeScript の検査件数にはコンパイラーの依存先も含むため、ESLint の件数とは合算しません。

診断処理はツールの導入・ダウンロード、自動修正、emit、キャッシュ、TDD 履歴への追記を行いません。
ただし、ESLint の設定やプラグインはローカルコードとして実行され、副作用を持つ場合があります。
信頼するプロジェクトでのみ使ってください。隔離実行ではありません。
結果は実行時点の **スナップショット** であり、実行時の正しさ、TDD の Red／Green、
承認、リリース準備完了の証拠にはなりません。対象テストと最終の全体 `gate` は維持してください。
ローカルで確認した環境は Linux／Node 24 です。macOS／Windows は未確認です。
tsconfig のない JavaScript 単独プロジェクト、Python、Rust は次期対応です。
時間や AI コストがどれだけ減るかは未測定です。

### 公開済みの npm パッケージをインストールする

**0.1.2** は **2026-10-19 (JST)** に公開しました。Node.js 20 以上を用意し、
スキルを導入するプロジェクトで次のコマンドを実行してください。

```sh
npm install -g musubix6@0.1.2
musubix6 --version
musubix6 init .
musubix6 list
```

グローバルにインストールしない場合は、`npx --yes musubix6@0.1.2 init .` を使います。
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
```

グローバルインストールは clone したディレクトリへのリンクになるため、
ディレクトリは削除しないでください。更新方法は次の節で説明します。
チェックアウトには、npm に未公開の変更が含まれる場合があります。

## CLI と導入済みスキルの更新方法

更新は **CLI** と **プロジェクトごとのスキル** の 2 段階で行います。
`npm install -g` だけでは、コピー済みの `.github/skills/` は更新されません。

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

   特定の版にそろえる場合は、`npm install -g musubix6@0.1.2` のように指定します。
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

上記と同じ方法でスキルをバックアップし、対象プロジェクトのルートで実行します。

```sh
npx --yes musubix6@latest --version
npx --yes musubix6@latest init . --force
```

コピー後は手順 5 と同じ確認を行ってください。
この方法では、別途インストールしてあるグローバルの `musubix6` は更新しません。
SDD のゲート検証にも、`npx --yes musubix6@latest sdd gate` を使ってください。
古いグローバル CLI ではなく、指定した版で検証できます。
特定の版を使う場合は、ゲート検証も含め、各コマンドの `@latest` を `@0.1.2` に置き換えます。

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

要件定義から追加開発、マニュアル作成までの手順は [`docs/tutorial-app-development-1.md`](docs/tutorial-app-development-1.md) を参照してください。

## テスト

リポジトリのルートで、診断テスト用の開発依存をインストールしてから実行します(Node ≥ 20)。

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
