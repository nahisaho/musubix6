# チュートリアル: 自然言語だけで musubix6 を使ってアプリを開発する

このチュートリアルでは、**コマンドを自分で打たず、Copilot CLI への日本語の依頼だけ**で、要件定義から追加開発、マニュアル作成、コンテナーでのテストまでを進めます。題材は、依存パッケージを使わない Node.js のコマンドライン ToDo アプリ `todo-cli` です。

ここに載せたプロンプトと結果は、`/tmp/musubix-tutorial/todo-cli` で実際に開発したときの記録です(Node.js 24、Copilot CLI)。

## 進め方の約束

- 読者が行うのは、**プロンプトを入力すること**と、**エージェントの質問に答えること**だけです。
- 各節の「入力プロンプト」を、そのまま Copilot CLI に入力します。
- 「エージェントが実行すること」は、エージェントが内部で行う作業の記録です。読者は実行しません。何が起きるかを理解するために載せています。
- 例外は、Copilot CLI の起動(`copilot`)だけです。
- **プロンプトにスキル名は不要です。** 依頼の内容に合わせて、エージェントが必要なスキルを自動で選びます。表の「働くスキル」は、裏で使われるものの説明です。

| 段階 | 働くスキル | 成果物 |
|---|---|---|
| 1. 準備 | `lean-sdd-tdd` | `.sdd/config.json` |
| 2. 要件定義(対話) | `sdd-spec-interview` | `.sdd/specs/todo-core.md` |
| 3. 仕様レビューと承認 | `lean-sdd-tdd` | `.sdd/review-todo-core.md`、承認記録 |
| 4. TDD で実装 | `lean-sdd-tdd` | `test/`、`src/`、`bin/` |
| 5. 追加要件の開発 | 上記すべて | `.sdd/specs/todo-due.md` と追加実装 |
| 6. マニュアル作成 | `tech-writer` | `docs/user-manual.md` |
| 7. 日本語の修正 | `japanese-prose` | 診断スコア 100/100 |
| 8. コンテナー化とテスト | `wslc-containers` | `Dockerfile`、コンテナー内のテスト 15/15 |

## 0. 前提条件

- Node.js 20 以上、Git、GitHub Copilot CLI
- WSL 2.9.3 以降(§8 の `wslc.exe` に使います)
- Python 3.10 以上と [uv](https://docs.astral.sh/uv/)(日本語診断に使います。GiNZA は初回に自動で取得されます)
- musubix6 のリポジトリ(スキルのコピー元)

作業ディレクトリ `/tmp/musubix-tutorial/todo-cli` を用意し、そこで Copilot CLI を起動します。ここだけは読者が操作します。

```sh
mkdir -p /tmp/musubix-tutorial/todo-cli && cd /tmp/musubix-tutorial/todo-cli
copilot
```

## 1. 準備

### 入力プロンプト

```text
このディレクトリを新しい Git リポジトリにして、musubix6 の開発環境を整えて。
musubix6 は /home/nahisaho/GitHub/musubix6 にある。
そのスキルを .github/skills にコピーして、SDD を初期化して。
アプリは依存パッケージなしの Node.js(ESM)で作る。テストは node --test で、npm test から実行できるようにして。
```

### エージェントが実行すること

<details>
<summary>実行内容と結果</summary>

`git init`、スキルのコピー、`package.json` の作成、`sdd.mjs init` を行います。

```json
{
  "name": "todo-cli",
  "version": "0.1.0",
  "type": "module",
  "bin": { "todo": "bin/todo.mjs" },
  "scripts": { "test": "node --test test/*.test.mjs" }
}
```

```text
init ok: .sdd/config.json (testCmd: node --test --test-name-pattern {id}(?![0-9A-Za-z]) {file}; checks: test)
next: write .sdd/specs/<feature>.md (see references/spec-template.md)
```

</details>

> **メモ**: Node.js 24 では `node --test test/` のようなディレクトリ指定が失敗します(`Cannot find module '.../test'`)。このチュートリアルでは、最初の gate で実際にこの失敗に当たりました。§4 で、エージェントが自分で原因を見つけて直します。

> コミット時に `Author identity unknown` が出る場合は、「このリポジトリだけ、Git のユーザー名とメールアドレスを tutorial / tutorial@example.com にして」と依頼します。

## 2. 対話で要件定義書を作る

### 入力プロンプト

```text
コマンドラインで使える ToDo 管理アプリを作りたい。
```

「〜を作りたい」という依頼だけで、要件ヒアリングのスキル(`sdd-spec-interview`)が自動で働きます。エージェントは、まずリポジトリを調べます。そのうえで、**1 回に 1 問**、選択肢と推奨値つきで質問します。回答は選択肢でも自由記述でもかまいません。「おまかせ」と答えると、推奨値が採用されます。

今回の記録は次のとおりです。質問のたびに「おまかせ」と答え、推奨値を採用した想定で、決まった内容を並べています。

| # | 質問(要点) | 回答 |
|---|---|---|
| 1 | 目的と利用者は?(個人用 CLI / チーム共有 / Web API) | 個人用の CLI |
| 2 | 技術スタックは?(Node.js / Python / Go) | Node.js、依存パッケージなし |
| 3 | 基本機能は?(追加・一覧・完了 / 削除や編集も) | 追加・一覧・完了だけ |
| 4 | 空のタイトルなど不正入力の扱いは?(例外 / 無視) | 例外にする。CLI は `error: …` を stderr に出し、終了コード 1 |
| 5 | 保存方法は?(JSON ファイル / SQLite) | JSON ファイル。保存先は環境変数で変更可能 |
| 6 | 存在しない ID や壊れた保存ファイルは? | 固定メッセージのエラー。ファイルは変更しない |

質問は 6 問で、上限の 10 問に収まりました。最後に、エージェントは 10 行以内の要約を示します。異論がなければ spec を書きます。

### 成果物: `.sdd/specs/todo-core.md`

最初の版は REQ が 7 件でした。次節のレビューを受けて 8 件になります(最終版を示します)。

```md
---
feature: todo-core
tier: T1
approval: auto
---
# todo-core
Goal: 個人用のコマンドラインToDo管理(追加・一覧・完了)を、JSONファイルに保存して提供する。
Non-goals: 期限・優先度(次回追加)、複数ユーザー、同時書き込みの排他制御、GUI。

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-TODO-001 | When `addTask(file, title)` is called with a non-blank title, the system shall store a task `{id, title, done:false}` with id = (max existing id)+1 (first id is 1), trim the title, and return the task. | TEST-TODO-001 |
| REQ-TODO-002 | If the title is empty or whitespace only, then `addTask` shall throw an Error with message `title is required` and shall not change the file. | TEST-TODO-002 |
| REQ-TODO-003 | When `listTasks(file)` is called, the system shall return all tasks ordered by id ascending, or `[]` if the file does not exist. | TEST-TODO-003 |
| REQ-TODO-004 | When `completeTask(file, id)` is called with an existing id, the system shall set `done:true` and persist it. | TEST-TODO-004 |
| REQ-TODO-005 | If the id is not a positive integer or does not exist, then `completeTask` shall throw an Error with message `task not found: <id>`. | TEST-TODO-005 |
| REQ-TODO-006 | When `todo add <title...>`, `todo list` or `todo done <id>` succeeds, the CLI shall exit 0 and print to stdout `added #<id> <title>`, `[x] #<id> <title>` / `[ ] #<id> <title>` per task, or `done #<id>`; words after `add` are joined by one space. | TEST-TODO-006 |
| REQ-TODO-007 | If a command fails, is unknown, or has a missing/extra argument, then the CLI shall print `error: <message>` to stderr and exit 1. | TEST-TODO-007 |
| REQ-TODO-008 | If the storage file is not valid JSON or not an array of `{id:positive integer, title:string, done:boolean}` with unique ids, then every operation shall throw an Error with message `invalid todo file` and shall not change the file. | TEST-TODO-008 |

## Assumptions / risks
- 保存先は環境変数 `TODO_FILE`、未指定なら `./todos.json`(TEST-TODO-006 で確認)。
- 同時実行時の競合、書き込み権限エラーの個別メッセージは対象外(エラーは 007 の形式に正規化)。
```

書き方のポイントは次のとおりです。

- 1 行が 1 つの要件で、EARS 形式(`When …, the system shall …` / `If …, then …`)で書かれます。
- ID は `REQ-<機能>-nnn` と `TEST-<機能>-nnn` で、リポジトリ内で一意になります。
- 具体的な値(メッセージ、終了コード)を入れると、テストが一意に決まります。
- 決めた既定値は `Assumptions / risks` に残ります。

## 3. 仕様の独立レビューと承認

既定の `approval: auto` では、人間の承認は不要です。代わりに、**別のエージェントによる独立レビュー**を受け、指摘を直してから承認を記録します。

### 入力プロンプト

```text
.sdd/specs/todo-core.md を、別のエージェント(rubber-duck)に独立レビューさせて。曖昧な点、テストできない点、不足している要件を挙げさせて。
指摘は spec に反映して、レビュー結果を .sdd/review-todo-core.md に記録し、承認まで済ませて。
```

初版(7 件)に対する指摘は次の 5 件でした。

| 重大度 | 指摘 | 対応 |
|---|---|---|
| Blocking | CLI の引数仕様(複数語タイトル、必須引数)が未定義 | REQ-006 と REQ-007 に明記 |
| Blocking | 壊れた JSON を読んだときの挙動がない | **REQ-TODO-008 を追加** |
| Non-Blocking | 不正な ID(`0`、`1.5`、`abc`)の扱いが曖昧 | REQ-005 に統合 |
| Non-Blocking | ID の一意性・型の検証がない | REQ-008 に統合 |
| Non-Blocking | 書き込み失敗時の挙動がない | 対象外として前提に記録 |

実装前にこれらを見つけられたことが、レビュー工程の価値です。

### エージェントが実行すること

<details>
<summary>実行内容と結果</summary>

spec を直したあと、`review template` で最新の spec ハッシュ入りの雛形を取り、結果を `.sdd/review-todo-core.md` に書きます(最新の `review template` は、機能ごとに別のファイルへ保存するよう案内します。共有の `review.md` は、次の機能で上書きされて古くなります)。

```md
spec: sha256:ae91093a…
verdict: pass
open: 0

## Findings
| ID | Severity | Where | Status |
|----|----------|-------|--------|
| F-1 | Blocking | REQ-TODO-006/007 CLI引数仕様の欠落 | Closed |
| F-2 | Blocking | 破損JSONの挙動欠落 -> REQ-TODO-008 追加 | Closed |
…
```

検証して、承認を記録します。

```text
REVIEW OK: .sdd/review-todo-core.md
recorded todo-core by ai:rubber-duck: .sdd/specs/todo-core.md — note: T1 specs without approval: human are NOT lock-enforced …
```

</details>

> **ポイント**
> - `review-todo-core.md` の先頭の `spec: sha256:…` は、spec の現在のハッシュと一致している必要があります。spec を直したら、エージェントが取り直します。
> - `open:` が 0 でなければ承認できません。
> - T1 の spec は、承認しても改変がロックされません(ロックされるのは T2 と `approval: human` のみ)。

## 4. TDD で実装する(Red → Green → gate)

### 入力プロンプト

```text
.sdd/specs/todo-core.md の全要件を実装して。
先に全テストを書いて Red を確認し、実装して Green にして。最後に gate を通して、通ったらコミットして。
```

### エージェントが実行すること

エージェントは、次の順に進めます。

**① テストを書く。** 各テストには `@id` と `@verifies` のコメントを付け、テスト名に ID を含めます。

```js
/** @id TEST-TODO-001 @verifies REQ-TODO-001 */
test('TEST-TODO-001 add assigns incrementing ids and trims title', () => {
  const f = tmp();
  assert.deepEqual(addTask(f, '  牛乳を買う  '), { id: 1, title: '牛乳を買う', done: false });
  assert.deepEqual(addTask(f, '郵便'), { id: 2, title: '郵便', done: false });
  assert.equal(JSON.parse(readFileSync(f, 'utf8')).length, 2);
});
```

**② 失敗するスタブを置く。** テストが `import` で読み込みエラーになると、Red として認められません。そこで、例外を投げるだけのスタブ(`src/todo.mjs`)と、終了コード 99 だけの `bin/todo.mjs` を用意します。

**③ Red を記録する。** 8 件とも、アサーション失敗または未実装エラーで失敗することを確認します。

```text
RED ok TEST-TODO-001 (REQ-TODO-001) 95ms — fails with: Error: not implemented
RED ok TEST-TODO-006 (REQ-TODO-006) 123ms — fails with: AssertionError [ERR_ASSERTION]: …
…
```

**④ 実装する。** 実装には `@id CODE-… @implements REQ-…` を付けます。テストは書き換えません。

```js
/** @id CODE-TODO-001 @implements REQ-TODO-001 REQ-TODO-002 */
export function addTask(file, title) { /* … */ }
```

**⑤ Green を記録し、gate を実行する。** 初回の gate は、次のように**失敗**しました。

```text
SDD GATE FAIL
✓ trace: 8 REQ, 0 errors
✓ ledger: 16 entries, chain intact
✓ tdd evidence: 8/8 tests Red→Green
✗ cmd test (0.2s)
    Error: Cannot find module '/tmp/musubix-tutorial/todo-cli/test'
```

原因は、§1 で触れた `node --test test/` です。エージェントが `package.json` を `node --test test/*.test.mjs` に直すと、次のように通りました。読者が原因を調べる必要はありません。

```text
SDD GATE PASS
✓ trace: 8 REQ, 0 errors
✓ ledger: 16 entries, chain intact
✓ tdd evidence: 8/8 tests Red→Green
✓ cmd test (0.6s)
```

gate は 4 点を検査します。REQ とテストの対応(trace)、証跡の改ざん防止(ledger)、Red → Green の証跡、プロジェクト自身のテストです。通ったあと、`feat: todo-core (add/list/done)` としてコミットされます。

## 5. 要件を追加して追加開発する

### 入力プロンプト

```text
todo-cli に期限機能を追加したい。タスクに期限を付けられて、期限切れの未完了タスクだけを一覧したい。
```

既存の機能に足す依頼です。そのため、新しい spec `todo-due` を作ります。`todo-core` の spec は書き換えません。ヒアリングでは、次の点が決まりました。

| 質問(要点) | 回答 |
|---|---|
| 期限の形式は? | `YYYY-MM-DD` のみ。時刻は扱わない |
| 当日が期限のタスクは期限切れか? | 期限切れにしない(`due < today`) |
| 「今日」の取得方法は? | 環境変数 `TODO_TODAY` で差し替え可能。未指定ならローカル日付 |
| 期限なしタスクの表示は? | 従来どおり |

### 既存コードへの影響を調べる

#### 入力プロンプト

```text
共有モジュール src/todo.mjs を変えると、どの要件とテストに影響するか調べて。
```

エージェントは `impact` を実行し、次の結果を報告します。

```text
IMPACT src/todo.mjs (REQ-TODO-001, REQ-TODO-002, REQ-TODO-003, REQ-TODO-008, REQ-TODO-004, REQ-TODO-005)
  verified by: TEST-TODO-001, TEST-TODO-002, TEST-TODO-003, TEST-TODO-004, TEST-TODO-005, TEST-TODO-008
  same feature: 2 other REQ(s) (REQ-TODO-006, REQ-TODO-007)
```

変更すると、既存の 8 件のテストを再検証する必要があります。今回は既存の REQ 行を書き換えずに済みました。

### spec のレビュー

#### 入力プロンプト

```text
.sdd/specs/todo-due.md を、別のエージェント(rubber-duck)に独立レビューさせて。既存の todo-core との衝突も確認させて。
指摘は反映して、レビュー結果を記録し、承認まで済ませて。
```

初版の spec(REQ 6 件)に、Blocking が 2 件出ました。

- `--due` の位置、`--` の扱い、重複指定が未定義です。→ 位置は任意とし、`--` 以降は全てタイトル、重複はエラーと定めました。
- コマンドごとの許可オプションとエラー文言が曖昧です。→ REQ-DUE-007 として独立させました。

あわせて、一覧の表示形式の変更(期限つきタスクに ` (due …)` が付く)は、**既存出力を拡張する変更**だと明記しました。最終版の要件は次のとおりです(要約)。

| ID | 要件(要約) |
|---|---|
| REQ-DUE-001 | 有効な日付なら `due` を保存する。省略時は `due` キー自体を持たない |
| REQ-DUE-002 | `2026-02-30` や `tomorrow` は `invalid due date: <値>` で拒否する |
| REQ-DUE-003 | `overdue:true` では、未完了かつ `due < today` のタスクだけを返す |
| REQ-DUE-004 | 保存済みの `due` が不正なら `invalid todo file` にする |
| REQ-DUE-005 | `add` の `--due` は任意の位置に置け、`--` 以降はタイトルとする。一覧に ` (due …)` を付ける |
| REQ-DUE-006 | `list --overdue` は `TODO_TODAY` かローカル日付を「今日」とする |
| REQ-DUE-007 | 不正なオプションは `due date is required` / `duplicate option` / `unknown option` で終了コード 1 |

### 実装

#### 入力プロンプト

```text
.sdd/specs/todo-due.md の全要件を実装して。既存のテストは、spec が変更を定めている箇所以外は変えないで。
先に全テストを書いて Red を確認し、実装して Green にして。最後に全体の gate を通して、コミットして。
```

`addTask` は、すでに受け取れる引数を増やすだけなので、スタブは不要でした。テストが**アサーションで失敗**する Red を、7 件とも確認できます。

```text
RED ok TEST-DUE-001 (REQ-DUE-001) 106ms — fails with: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
RED ok TEST-DUE-002 (REQ-DUE-002) 117ms — fails with: AssertionError [ERR_ASSERTION]: Missing expected exception.
…
```

実装後に Green を記録し、全体で gate を実行します。

```text
GREEN ok TEST-DUE-001 (REQ-DUE-001) 96ms
…
SDD GATE PASS
✓ trace: 15 REQ, 0 errors
✓ ledger: 30 entries, chain intact
✓ tdd evidence: 15/15 tests Red→Green
✓ cmd test (0.8s)
```

REQ が 8 件から 15 件に増え、既存のテストも通ったままです。`feat: todo-due (due date and --overdue)` としてコミットされます。

## 6. マニュアルを作る

### 入力プロンプト

```text
todo-cli のユーザーマニュアルを日本語で作って。docs/user-manual.md に、前提条件、手順、完了の確認、トラブルシューティングを入れて。
書いたら、手順どおりに実際に実行して、出力が一致することを確かめて。
```

文書作成のスキルが自動で働き、`user-manual` の型(前提条件 → 手順 → 完了の確認 → トラブルシューティング)で書きます。書いたあと、構造 lint を実行します。

```text
L1 [placeholder] Unresolved placeholder 'todo' remains without a reason/tracking reference; resolve before publishing.
```

アプリ名 `todo-cli` の `todo` を、未解決のプレースホルダーと誤検出した結果です。内容は問題ないため、エージェントは「保持」と判断します。

> 手順書は、**実際に実行して確かめて**から確定します。今回は、マニュアルの手順どおりに実行し、出力が一致することを確認しました。

## 7. マニュアルの日本語を直す

### 入力プロンプト

```text
docs/user-manual.md の日本語を直して。事実、コマンド、ID は変えないで。
修正前後の診断スコアも教えて。
```

### エージェントが実行すること

**① 診断のベースラインを取る。** スコアは 98 で、指摘は 2 件(`indirect_ability`、「できる」または具体的な動作に簡潔にする)でした。

**② 文脈を見て直す。** 診断の指摘は、確認すべき箇所を示すだけです。機械的な置換はしません。指摘された 2 文に加え、同じ型の冗長な表現も直しました。

| 修正前 | 修正後 |
|---|---|
| 〜を使用することによって、〜を管理することができるようになります | 〜を読むと、〜ができます |
| 基本操作を行うことが可能な方 | 基本操作を知っている方 |
| 〜と表示されることになります | 〜と表示されます |
| 〜で表示されるようになっています | 〜で表示されます |
| 環境変数 `TODO_FILE` によって変更することが可能です | 環境変数 `TODO_FILE` で保存先を変更できます |

**③ ベースラインとの差分で再診断する。**

```text
docs/user-manual.md: score 100/100, 0 finding(s)
```

最後に、手順を再実行して出力が変わっていないことと、gate が通ることを確認し、`docs: user manual (Japanese, prose-linted)` としてコミットします。修正は 3 回までです。それでも指摘が残る場合は、「収束しなかった」と報告されます。

## 8. WSLC でコンテナーを作成してテストする

Windows の WSL コンテナー CLI(`wslc.exe`、WSL 2.9.3 以降)を使い、アプリをコンテナーにしてテストします。Docker Desktop は不要です。`wslc-containers` スキルが、WSL 内から `wslc.exe` を呼び出します。

### 入力プロンプト

```text
todo-cli を WSLC のコンテナーにして、コンテナー内でテストを実行して。
最後に、ボリュームでデータを保持したまま CLI を動かして。後片付けもして。
ビルドに使った Dockerfile はリポジトリに残して。
```

エージェントは、コンテナーを操作する前に実行内容を確認します。見知らぬイメージやコマンドを実行するときは、内容を確認してから許可してください。

### エージェントが実行すること

#### 8.1 Dockerfile を作ってビルドする

通常は、公式の Node.js イメージを使う次の Dockerfile で足ります。`.dockerignore` には `.git`、`.sdd`、`.github`、`node_modules`、`todos.json` を書きます。

```dockerfile
FROM docker.io/library/node:24-alpine
WORKDIR /app
COPY package.json ./
COPY bin ./bin
COPY src ./src
COPY test ./test
ENV TODO_FILE=/data/todos.json
RUN mkdir /data
ENTRYPOINT ["node", "bin/todo.mjs"]
```

#### 8.2 レジストリに届かない場合

`network is unreachable` は、コンテナー側の VM のネットワークが一時的に使えないときに起きます。Dockerfile の誤りではありません。次の順で切り分けてください。

1. 接続を確認します。`wslc.exe run --rm docker.io/library/alpine:latest wget -q -T5 -O- https://registry-1.docker.io/v2/` が `401 Unauthorized` を返せば、レジストリに届いています(401 は到達の証拠です)。この場合は 8.1 をそのまま再実行します。
2. 届かないときは、`wsl --shutdown` で WSL の VM を再起動し、もう一度試します。VPN やプロキシを使っている場合は、いったん切って試します。
3. それでも届かない場合に限り、次のオフライン方式に切り替えます。

今回の環境では、ビルドが次のエラーで失敗しました。コンテナー側の VM から Docker Hub に接続できないためです(イメージの取得も同じ理由で失敗します)。

```text
ERROR: failed to solve: docker.io/library/node:24-alpine: failed to do request: …
dial tcp 44.212.194.123:443: connect: network is unreachable
```

エージェントは、この原因を切り分けて、ローカルにある `alpine` を土台にする方法に切り替えました。ホスト側で取得した Node.js(musl 版)と、その実行に必要な `libstdc++`、`libgcc` を `COPY` します。

```dockerfile
FROM alpine:latest
COPY vendor/libstdc++.so.6.0.34 vendor/libgcc_s.so.1 /usr/lib/
RUN ln -s libstdc++.so.6.0.34 /usr/lib/libstdc++.so.6
COPY vendor/node /usr/local/bin/node
WORKDIR /app
COPY package.json ./
COPY bin ./bin
COPY src ./src
COPY test ./test
ENV TODO_FILE=/data/todos.json
RUN mkdir /data
ENTRYPOINT ["node", "bin/todo.mjs"]
```

ビルドしたイメージで Node.js が動くことを確認します。

```text
v24.21.0
```

> **途中でつまずいた点(エージェントが自分で解決しました)**
> - ビルドコンテキストに、シンボリックリンクを含む Node.js の展開結果をそのまま置くと、`readlink …/corepack: function not implemented` で失敗します。`node` の実行ファイル 1 つだけを置くと解決します。
> - `libstdc++` がないと、`Error relocating /usr/local/bin/node: … symbol not found` になります。

接続できる環境の方は、「公式イメージでビルドして」と依頼すれば、8.1 の Dockerfile が使われます。

> **再検証(2026-10-12、wslc 3.0.3.0)**: `docker.io/library/node:24-alpine` を取得でき、8.1 の Dockerfile のままビルドできました。次の 2 点も確認できました。
>
> - コンテナー内で `node --test test/todo.test.mjs` を実行すると、テストが通る
> - `-v` のボリュームに、`add` の結果が次の起動まで残る

`network is unreachable` は再現しませんでした。追加の確認は次のとおりです。

> - 4 イメージを削除して取得し直しても、成功した(`node`、`python`、`golang`、`busybox`)
> - コンテナー内から、レジストリ `registry-1.docker.io` に IPv4 と HTTPS で到達できた(認証前なので 401 が返る)
> - `--no-cache` でビルドし直しても成功した
>
> 失敗の原因は、当時のネットワークの状態だったと考えられます。
>
> まず 8.1 を試してください。`network is unreachable` が出たときだけ、8.2 に進みます。

#### 8.3 コンテナー内でテストを実行する

起動コマンドを `node --test` に切り替えて、テストファイルを実行します。

```text
✔ TEST-TODO-005 complete rejects unknown or invalid id (0.769539ms)
✔ TEST-TODO-006 CLI add/list/done succeed with exit 0 (162.371487ms)
✔ TEST-TODO-007 CLI errors go to stderr with exit 1 (256.298707ms)
✔ TEST-TODO-008 invalid storage file is rejected and left unchanged (2.783069ms)
ℹ tests 15
ℹ pass 15
ℹ fail 0
```

ホストと同じ 15 件がすべて通りました。

#### 8.4 ボリュームでデータを保持して動かす

保存先 `/data/todos.json` を名前付きボリュームに置くと、コンテナーを破棄してもタスクが残ります。

```text
added #1 牛乳を買う (due 2026-10-01)
[ ] #1 牛乳を買う (due 2026-10-01)
done #1
[x] #1 牛乳を買う (due 2026-10-01)
error: task not found: 9
```

毎回、使い捨てのコンテナーを起動していますが、状態は引き継がれています。最後に、ボリュームとイメージを削除して後片付けをします。

## 9. 完成した成果物

```text
todo-cli/
├── .sdd/
│   ├── specs/todo-core.md, todo-due.md   要件(REQ)とテスト ID
│   ├── review-todo-core.md              独立レビューの記録
│   ├── tdd.jsonl                        Red/Green の証跡(ハッシュ連鎖)
│   └── approvals.json, config.json
├── Dockerfile, Dockerfile.offline       コンテナーのビルド定義
├── bin/todo.mjs                         CLI のエントリーポイント
├── src/todo.mjs, src/cli.mjs            実装(@implements 付き)
├── test/todo.test.mjs, due.test.mjs     テスト(@verifies 付き)
└── docs/user-manual.md                  日本語マニュアル
```

## 10. つまずいたときの依頼例

症状をそのままエージェントに伝えれば、原因の調査と修正を任せられます。

| 症状 | 原因 | 依頼の例 |
|---|---|---|
| Red が「読み込みエラー」で拒否される | テストが未作成のモジュールを `import` している | 「Red が読み込みエラーで拒否された。失敗するスタブを先に置いて、もう一度 Red を記録して」 |
| gate の `cmd test` が `Cannot find module '.../test'` | Node.js 24 では `node --test <ディレクトリ>` が使えない | 「gate が失敗した。原因を調べて直して」 |
| 承認の記録が review を拒否する | `spec: sha256:` が現在の spec と不一致 | 「spec を直したので、レビュー結果のハッシュを取り直して、承認し直して」 |
| コミットが `Author identity unknown` で失敗する | Git のユーザー名とメールアドレスが未設定 | 「このリポジトリだけ、Git のユーザー名とメールアドレスを設定して」 |
| `tech-writer` の lint が名前を `placeholder` と指摘する | アプリ名の `todo` の誤検出 | 「この指摘は誤検出か判断して、誤検出なら保持して」 |
| ビルドが `network is unreachable` で失敗する | コンテナーからレジストリに届かない | 「ビルドが network is unreachable で失敗した。ローカルのイメージだけでビルドする方法に切り替えて」 |
| gate が既存テストの失敗で落ちる | 追加要件が既存の出力形式を変えるため、既存テストと両立しない | 「gate が失敗した。原因を調べて直して。due の spec が定めている範囲でなら、既存テストの更新はしてよい。通ったらコミットして」 |
| 全体の gate が `test changed since last Green` で失敗する | 既存テストを spec の指示で更新したため、証跡が古い | 「gate がまだ失敗している。原因を調べて、正しい手順で直して。通ったらコミットして」 |

人間の承認が必要な場面は、次のとおりです。spec に `approval: human` と書かれ、エージェントが承認対象のファイルのパスとハッシュを示して質問します。承認者の実名で答えてください。

- セキュリティの緩和
- 削除などの不可逆操作
- 秘密情報の扱い
- リリース

## 11. 次のステップ

- セキュリティ、状態遷移、公開契約を含む機能は **T2** です。「この機能は T2 として扱って。`## Design` を書き、スパイクと並列レビューもして」と依頼します(詳細は `.github/skills/lean-sdd-tdd/references/t2.md`)。
- 複数の機能にまたがる開発は、「機能を分割して、順序と依存を `.sdd/plan.md` に書いて。進捗も確認して」と依頼します。
- マージ前は、「全体の gate を通して」と依頼します。変更分だけの確認は、「変更分だけ gate して」と頼みます。

## 12. 再実験での確認結果

このチュートリアルを、スキル名を含まないプロンプトだけで、別のディレクトリ(`/tmp/musubix-tutorial2`)に再現しました(`copilot -p` による非対話実行。ヒアリングは「おまかせ」と答えた扱い)。各段階は新しいセッションで実行しています。

| 段階 | 結果 |
|---|---|
| 1. 準備 | 動作。スキルを全 6 件コピーし、`npm test` は `node --test` で設定された。Git のユーザー名は未設定のためコミットされなかった |
| 2. 要件定義 | スキル名なしで要件ヒアリングが働き、REQ 11 件の spec ができた |
| 3. レビューと承認 | 動作。指摘は反映され、承認が記録された |
| 4. 実装 | 動作。Red → Green → gate PASS(12 REQ)、コミットまで完了 |
| 5. 追加開発 | 動作。ただし下記の 2 点が起きた |
| 6. マニュアル | 動作。手順の実行確認まで行われた |
| 7. 日本語修正 | スキル名なしで診断が働いた。診断スコアは 99 で、直す箇所がなく、無修正で完了した |
| 8. コンテナー | 動作。公式イメージが使えないため、ローカルの `alpine` に切り替えて、22 件のテストとボリューム確認が通った |

再実験では、本文の記録と異なる点がありました。

- **spec の内容は実行ごとに変わります。** 「おまかせ」の推奨値は毎回同じとは限りません。再実験では、`rm` コマンドや終了コード 2 を含む spec になり、追加機能の spec は T2 と判定されました。REQ の件数や ID は、本文の例と一致しなくてかまいません。
- **追加要件が既存の出力を変えると、既存テストの更新が必要になります。** 「既存のテストは変更しないで」と頼むと、gate が失敗したままコミットされました。そのため、§5 のプロンプトは、spec が変更を定める箇所だけ更新を許す文面にしています。
- **既存テストを更新すると、証跡の再記録が必要です。** gate が `test changed since last Green` で失敗します。§10 の依頼文で、エージェントが再記録して通せます。
- **ヒアリングの回答は、対話で返すのが本来の使い方です。** 非対話の実行では、質問の代わりに「おまかせ」を依頼文に書いています。
