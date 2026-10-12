# チュートリアル 2: 複数機能のアプリを、慎重に開発する(注文受付 API)

[チュートリアル 1](tutorial-app-development-1.md) では、1 つの小さな CLI を、要件定義から開発しました。このチュートリアルでは、難易度を上げます。

| | チュートリアル 1 | このチュートリアル |
|---|---|---|
| 題材 | 個人用 ToDo CLI | 在庫つきの注文受付 HTTP API(認証、状態遷移、在庫の引当) |
| 規模 | 2 機能(REQ 15 件) | **5 機能**(REQ 46 件) |
| 区分 | T1(通常の変更) | **T2**(セキュリティ、状態遷移、データ整合性) |
| 新しく使うもの | — | 機能の分割と `plan`、`## Design`、リスク別の**並列レビュー**、再承認 |

ここに載せたプロンプトと結果は、`/tmp/musubix6-tutorial-2/order-api` で実際に開発したときの記録です(Node.js 24、Copilot CLI)。

## 進め方の約束

- チュートリアル 1 と同じです。読者は、**プロンプトを入力すること**と、**質問に答えること**だけを行います。
- **プロンプトにスキル名は不要です。** 内容に合わせて、エージェントが必要なスキルを選びます。
- 「エージェントが実行すること」は、内部の作業の記録です。読者は実行しません。
- 質問の回答は、本来は対話で返します。ここでは非対話で検証したため、プロンプトに「おまかせ」と書いています。
- spec の内容は、実行のたびに変わります。件数や文言は、本文の例と一致しなくてかまいません。

## 0. 前提条件

チュートリアル 1 の前提条件に加えて、§7 で WSL 2.9.3 以降の `wslc.exe` を使います。作業ディレクトリで Copilot CLI を起動します(ここだけ読者が操作します)。

```sh
mkdir -p /tmp/musubix6-tutorial-2/order-api && cd /tmp/musubix6-tutorial-2/order-api
copilot
```

## 1. 準備

### 入力プロンプト

```text
このディレクトリを新しい Git リポジトリにして、musubix6 の開発環境を整えて。
musubix6 は /home/nahisaho/GitHub/musubix6 にある。そのスキルを .github/skills にコピーして、SDD を初期化して。
Git のユーザー名とメールアドレスは、このリポジトリだけ tutorial / tutorial@example.com にして。
アプリは依存パッケージなしの Node.js(ESM)で作る。テストは node --test で、npm test から実行できるようにして。.gitignore も作って。最後に初期状態をコミットして。
```

Git の設定を依頼に含めると、チュートリアル 1 で起きた `Author identity unknown` を避けられます。エージェントは、`package.json` を作ってから SDD を初期化します(逆順だと、技術スタックを認識できない警告が出るため、やり直しました)。

## 2. 機能に分割して、順序を決める

規模の大きい開発では、最初に**機能へ分割**し、作る順序と依存関係を決めます。

### 入力プロンプト

```text
小さな店向けの注文受付 HTTP API を作りたい。商品の在庫を持ち、API キーで認証し、注文は「作成 → 支払い済み → 出荷済み」、または「キャンセル」の状態で管理する。在庫は注文の作成で引き当て、キャンセルで戻す。
機能が多いので、機能に分割して、作る順序と依存関係を決めて。そのあと、最初の機能の要件定義書を作って。
```

エージェントは、依頼の中身から、要件ヒアリングと分割のスキルを自動で選びます。結果は、次の `.sdd/plan.md` です。

```md
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | auth | - | HTTP サーバ骨格 + API キー認証 (T2)。全 API の土台 |
| 2 | inventory | auth | 商品と在庫の登録・参照・調整 |
| 3 | order-create | inventory | 注文作成と在庫引当 (原子的、不足時は全体拒否) |
| 4 | order-fulfillment | order-create | created → paid → shipped の遷移、不正遷移の拒否 |
| 5 | order-cancel | order-create, order-fulfillment | キャンセルと在庫戻し (二重戻し防止) |
```

進捗は、いつでも次の依頼で確認できます。

```text
開発の進捗と、次に作る機能を教えて。
```

<details>
<summary>エージェントが実行すること(<code>plan</code>)</summary>

```text
· 1. auth [T2:missing] — HTTP サーバ骨格 + API キー認証 (T2)。全 API の土台
· 2. inventory [no-spec] ← auth — 商品と在庫の登録・参照・調整
…
next: auth
```

依存する機能が先に完了していないと、`plan` が警告します。

</details>

### T2 の spec には `## Design` が必須

`auth` は、セキュリティに関わるため **T2** と判定されました。T2 の spec には、REQ の表に加えて `## Design`(構成要素、データの流れ、決定事項と退けた案、最も危うい前提)が必須です。

```md
## Design
- `src/server.js`: `createServer({apiKeys})` returns node:http server; `src/auth.js`: `authenticate(headers, keys)` pure function.
- Flow: request → `/health` bypass → auth middleware (401) → router (404/handlers). Errors are JSON `{"error":code}`.
- Comparison: SHA-256 both sides then `crypto.timingSafeEqual`, to avoid length leaks.
- Riskiest assumption: keys from env only; spike = start with empty `API_KEYS` (TEST-AUTH-006).
```

「最も危うい前提」は、実装の前に小さく試す対象(スパイク)になります。

## 3. 観点別の並列レビューと承認(T2)

T2 では、レビューを**リスクの観点ごとに、別々のエージェントで並列に**行います。

### 入力プロンプト

```text
.sdd/specs/auth.md は認証というセキュリティに関わる機能なので、慎重にレビューしたい。
セキュリティ、正しさ、公開インターフェース、テストの十分さの観点ごとに、別々のエージェントで並列にレビューして。指摘は spec に反映し、レビュー結果を .sdd/review-auth.md に記録して、承認まで済ませて。
```

4 つの観点から、合計 **28 件**の指摘が出ました。主なものは次のとおりです。

| 観点 | 重大度 | 指摘 | 対応 |
|---|---|---|---|
| セキュリティ | High | `X-API-Key` ヘッダーが複数あると解釈が曖昧になる | 複数ある場合は 401 にする |
| セキュリティ | High | キーの強度に制約がない | 16 文字以上を起動時に検証する |
| セキュリティ | Medium | 複数キーの比較で、早期 return により時間差が出る | 全キーを定数時間で比較する |
| 公開インターフェース | High | 応答の `Content-Type` が未定義 | `REQ-AUTH-010` を追加する |
| 公開インターフェース | High | メソッドごとの 405 や HEAD の扱い | **見送り**。Non-goals に移し、理由を記録する |
| テスト | High | 定数時間比較をどうテストするか未定 | 時間を測らず、比較関数を注入して呼び出しを確認する |

レビュー結果は、`.sdd/review-auth.md` に 1 行 1 件で記録されます(重大度、場所、状態)。すべて `Closed` で、`verdict: pass` になった状態で承認されます。見送った指摘も、理由つきで `Closed (declined)` として残ります。

<details>
<summary>エージェントが実行すること(承認)</summary>

`review check` が `REVIEW OK` を返したあと、`approve record auth --by ai:<レビュー担当> --review .sdd/review-auth.md` で承認を記録します。T2 の spec は、承認の時点で**ハッシュでロック**されます。

```text
specs 1 [auth:T2:ok]
```

ロック後に spec を直すと、gate が失敗します。直したいときは、再レビューと再承認が必要です(§5 の「再承認」を参照)。

</details>

## 4. 実装して gate を通す

### 入力プロンプト

```text
.sdd/specs/auth.md の全要件を実装して。
先に全テストを書いて Red を確認し、実装して Green にして。最後に全体の gate を通して、コミットして。
```

```text
SDD GATE PASS
✓ lock auth: ok [ai, review file]
✓ trace: 10 REQ, 0 errors
✓ ledger: 23 entries, chain intact
✓ tdd evidence: 10/10 tests Red→Green
✓ cmd test (0.7s)
```

実装中に、エージェントは自分でテストの誤りを 2 件見つけて、Red から記録し直しました。

- `TEST-AUTH-003`: HTTP の仕様上、ヘッダー値の前後の空白は取り除かれます。空白つきのキーを HTTP 越しには送れません。そこで、`authenticate` を直接呼ぶ形に変えました。
- `TEST-AUTH-004`: キーなしのリクエストでは、比較関数が呼ばれません。`/health` の亜種のケースには、不正なキーを付けるようにしました。

こうした「テストの前提違い」は、Red の段階で見つかるのが利点です。実装を先に書いていれば、誤ったテストのまま通ってしまうことがあります。

## 5. 次の機能へ進む(inventory → order-create → order-fulfillment → order-cancel)

2 機能目以降は、「次の機能に進んで」と依頼します。1 つのプロンプトで、要件定義 → レビュー → 承認 → 実装 → gate → コミットまでを通せます。

### 5.1 inventory(通常の T2)

```text
.sdd/plan.md の次の機能に進んで。要件定義書を作り(ヒアリングは「おまかせ」で推奨値)、別のエージェントで独立レビューして指摘を反映し、承認して。そのあと実装して、全体の gate を通して、コミットして。
```

商品と在庫の登録・参照・調整 API(REQ 10 件)ができました。gate は 20 REQ で PASS です。

```text
✓ lock auth: ok [ai, review file]
✓ lock inventory: ok [ai, review summary]
✓ tdd evidence: 20/20 tests Red→Green, 1 weak Red (1 characterization: passed without a failing Red)
```

`weak Red (characterization)` とは、テストが実装前でも通った場合の記録です。認証とルーターが、すでに 401 と 404 を返すためです。実装が不要なテストは、「既存の挙動を固定するテスト」として、理由つきで記録されます。

### 5.2 order-create(原子性が重要)

在庫の引当は、途中で失敗しても在庫が減りっぱなしにならないことが重要です。そこで、プロンプトにそのリスクを書きます。

```text
.sdd/plan.md の次の機能に進んで。在庫の引当は途中で失敗しても在庫が減りっぱなしにならないことが重要なので、慎重に進めたい。要件定義書を作り(ヒアリングは「おまかせ」で推奨値)、リスクの観点ごとに別々のエージェントで並列にレビューして指摘を反映し、承認して。そのあと実装して、全体の gate を通して、コミットして。
```

並列レビューの Blocking 指摘が、設計を変えました。

> 補償処理(引当に失敗したら、減らした在庫を `adjust(+数量)` で戻す)は、**戻す処理そのものが失敗しうる**。補償の失敗を許容する仕様は、「在庫を失わない」という目的と矛盾する。

そのため、`## Design` を次のように改めました。

- 引当の前に、各商品の数量を**スナップショット**で保存する。
- 途中で例外が起きたら、スナップショットを**代入で復元**する(復元は失敗しない)。
- 退けた案(補償の `adjust(+)` ループ)は、`Design` に理由つきで残す。
- 失敗の注入点(`faultHook`)をテスト用に用意し、各行で失敗させて在庫が変わらないことを確認する(`TEST-ORD-004`)。

実装前に設計の欠陥を直せたのは、並列レビューの成果です。承認後の gate は、次のとおりです。

```text
✓ lock order-create: ok [ai, review file]
✓ trace: 29 REQ, 0 errors
✓ tdd evidence: 29/29 tests Red→Green, 1 weak Red (1 characterization: passed without a failing Red)
```

> **つまずいた点: レビューの記録が上書きされた**
> このとき、エージェントは `.sdd/review.md` を上書きしてしまい、`auth` の承認が古い(stale)状態になりました。git から復元して回復しています。次の機能からは、プロンプトに「レビュー結果は機能ごとに別のファイルに記録して、既存のものを上書きしないで」と書きます。

### 5.3 order-fulfillment(状態遷移)

状態遷移のある機能は、**許される遷移と許されない遷移をすべて数え上げる**よう依頼します。

```text
.sdd/plan.md の次の機能に進んで。状態遷移があるので、許される遷移と許されない遷移をすべて数え上げて要件にして。要件定義書を作り(ヒアリングは「おまかせ」で推奨値)、リスクの観点ごとに別々のエージェントで並列にレビューして指摘を反映し、承認して。レビュー結果は機能ごとに別のファイル(.sdd/review-<機能名>.md)に記録して、既存のものを上書きしないで。そのあと実装して、全体の gate を通して、コミットして。
```

| 現在の状態 | `pay` | `ship` | `cancel`(次の機能) |
|---|---|---|---|
| created | paid | 409 | cancelled |
| paid | 409 | shipped | cancelled |
| shipped | 409 | 409 | 409 |
| cancelled | 409 | 409 | 409 |

不正な遷移は、すべて `409 invalid_transition` です。繰り返しの `pay` は、冪等には扱わず、拒否します(「おまかせ」で選ばれた既定値です)。セキュリティの観点から「注文ごとの権限や、ロールによる認可」の指摘が出ましたが、全 API キーが同じ権限である前提のため、**見送り**ました。理由は、spec の Non-goals に記録されています。

```text
✓ lock order-fulfillment: ok [ai, review file]
✓ trace: 37 REQ, 0 errors
```

### 5.4 order-cancel(二重に戻さない)

```text
.sdd/plan.md の次の機能に進んで。キャンセルでの在庫の戻しは、二重に戻らないことが重要なので、慎重に進めたい。要件定義書を作り(ヒアリングは「おまかせ」で推奨値)、リスクの観点ごとに別々のエージェントで並列にレビューして指摘を反映し、承認して。レビュー結果は機能ごとに別のファイル(.sdd/review-<機能名>.md)に記録して、既存のものを上書きしないで。そのあと実装して、全体の gate を通して、コミットして。
```

#### 前の機能の spec を直す必要が出た(再承認)

`order-cancel` の設計中に、`order-fulfillment` の `REQ-FUL-004` に、`POST /orders/cancel` の扱いが含まれていることがわかりました。キャンセルは次の機能の責務なので、エージェントは次のように対応しました。

1. `REQ-FUL-004` と `TEST-FUL-004` から、`POST /orders/cancel` を外す。
2. T2 の spec は、直すとロックが外れるため、**再レビューして再承認**する(`.sdd/review-order-fulfillment-amend.md` に追記)。
3. 全体の gate で、5 つの機能すべてのロックが `ok` であることを確認する。

```text
SDD GATE PASS
✓ lock auth: ok [ai, review file]
✓ lock inventory: ok [ai, review summary]
✓ lock order-cancel: ok [ai, review file]
✓ lock order-create: ok [ai, review file]
✓ lock order-fulfillment: ok [ai, review file]
✓ trace: 46 REQ, 0 errors
✓ ledger: 96 entries, chain intact
✓ tdd evidence: 46/46 tests Red→Green, 3 weak Red (3 characterization: passed without a failing Red)
```

進捗を確認します。

```text
開発の進捗と、次に作る機能を教えて。
```

```text
✓ 1. auth [T2:ok]
✓ 2. inventory [T2:ok] ← auth
✓ 3. order-create [T2:ok] ← inventory
✓ 4. order-fulfillment [T2:ok] ← order-create
✓ 5. order-cancel [T2:ok] ← order-create, order-fulfillment
next: (all features done)
```

> **ポイント**
> - 影響範囲は、「`src/orders.js` を変えると、どの要件とテストに影響する?」と依頼すれば、`impact` で調べられます。
> - 前の機能の spec を直す場合は、必ず**再レビューと再承認**が必要です。エージェントが、ロックの失効を gate で検出します。

## 6. 実装の確認

最後に、全体の状態を確認します。

### 入力プロンプト

```text
全体の gate を通して、要件・テスト・実装の対応に漏れがないか確認して。確認していないことがあれば、それも教えて。
```

エージェントは、gate の結果に加えて、「確認していないこと」を正直に報告します。今回の記録では、たとえば次のとおりでした。

- 複数プロセスの同時実行は、対象外(メモリ内ストアのため)です。
- サーバーを実際に起動しての動作は、§7 のコンテナーで確認します。

## 7. WSLC のコンテナーで、HTTP API を動かして試す

### 入力プロンプト

```text
order-api を WSLC のコンテナーにして、コンテナー内でテストを実行して。
そのあと、API キーを環境変数で渡してサーバーを起動し、ポートを公開して、この環境から curl で認証・商品登録・注文作成・支払い・出荷・キャンセルの一連を試して。後片付けもして。
ビルドに使った Dockerfile はリポジトリに残して。
(補足: コンテナーからレジストリに届かない場合や、公式イメージが使えない場合は、ローカルのイメージ alpine と、ホストで取得できるものだけでビルドする方法に切り替えて。)
```

チュートリアル 1 と同じく、公式イメージの取得に失敗する環境では、ローカルの `alpine` に、ホストで取得した Node.js(musl 版)と `libstdc++`、`libgcc` を載せる方法に切り替わりました。

> **再検証(2026-10-12、wslc 3.0.3.0)**: 公式の `node:24-alpine` を取得でき、チュートリアル 1 §8.1 の Dockerfile でビルドできました。`network is unreachable` は再現していません。まず公式イメージでの構成を試し、失敗したときだけ、この代替策を使ってください。

結果は次のとおりです。

| 確認 | 結果 |
|---|---|
| コンテナー内のテスト | **47/47 件が成功** |
| キーなし、不正キー | 401 |
| 商品登録 | 201 |
| 注文作成 | 201。在庫が 10 から 7 に減る |
| 支払い、出荷 | `paid`、`shipped` |
| 出荷済みの注文のキャンセル | 409 |
| 別の注文を作成してキャンセル | `cancelled`。在庫が 7 に戻る |

起動したコンテナーを `-p 3000:3000` で公開し、ホストの `curl` から、全工程が仕様どおりに動くことを確認できました。後片付けでは、デモ用のコンテナー、イメージ、`vendor/` が削除されます。

> **つまずいた点**: この Dockerfile は、ホストで取得した Node.js のバイナリ(`vendor/` などの作業用ディレクトリ)に依存するため、そのままでは単独でビルドできません。公式イメージが使える環境では、チュートリアル 1 §8.1 の `node:24-alpine` 版で足ります。プロンプトはコミットまでは頼んでいないので、Dockerfile をコミットしたいときは、続けて「Dockerfile をコミットして」と頼みます。テストの件数は、機能の数に応じて実行ごとに変わります。

## 8. 完成した成果物

```text
order-api/
├── .sdd/
│   ├── plan.md                           機能の順序と依存
│   ├── specs/                            auth, inventory, order-create, order-fulfillment, order-cancel
│   ├── review.md, review-<機能名>.md      観点別レビューの記録
│   ├── approvals.json, tdd.jsonl         承認とロック、Red/Green の証跡
├── Dockerfile
├── src/                                  auth, server, inventory, orders, 各 routes, http-json, index
└── test/                                 機能ごとのテスト
```

コミット履歴です。

```text
build: Dockerfile for WSLC
feat(order-cancel): …
feat(order-fulfillment): …
feat(order-create): order creation with atomic stock reservation and rollback
feat(inventory): product and stock registration, lookup and adjustment API
feat(auth): API key authentication and HTTP server skeleton
chore: initial project setup with musubix6 skills and SDD
```

## 9. つまずいたときの依頼例

| 症状 | 原因 | 依頼の例 |
|---|---|---|
| 前の機能の gate が `lock … stale` で失敗する | レビューの記録(`review.md`)が上書きされた | 「review.md を git から復元して、機能ごとに別のファイルに記録し直して。承認も取り直して」 |
| 前の機能の spec を直したら、ロックが外れた | T2 の spec は、直すと再承認が必要 | 「spec を直したので、再レビューして、再承認して」 |
| レビューの指摘が多すぎて、判断に迷う | 観点ごとに指摘が出る | 「見送ってよい指摘と、必ず直す指摘を分けて。見送る理由は spec の Non-goals に書いて」 |
| 実装前に通るテストがある(weak Red) | 既存の層がすでに挙動を満たしている | 「この weak Red は、既存の挙動を固定するテストとして妥当か確認して」 |
| コンテナーのビルドが `network is unreachable` で失敗する | コンテナーからレジストリに届かない | 「ローカルのイメージだけでビルドする方法に切り替えて」 |

## 10. 次のステップ

- 認証情報の取り扱いや、削除などの不可逆な操作は、spec に `approval: human` が付き、**人間の承認**が必要になります。次のチュートリアルで扱います。
- 状態をファイルやデータベースに持つ場合は、永続化と並行性が新しいリスクになります。

## 11. 再実験での確認結果

このチュートリアルを、スキル名を含まないプロンプトだけで、別のディレクトリ(`/tmp/musubix6-tutorial-2/rerun/order-api`)に再現しました(`copilot -p` による非対話実行)。各段階は新しいセッションで実行し、`gate` と `plan` は別途実行して確認しています。

| 段階 | 結果 |
|---|---|
| 1. 準備 | 動作。スキル 6 件のコピー、SDD の初期化、Git のユーザー設定、初期コミットまで完了した |
| 2. 分割と最初の spec | 動作。5 機能の `plan` と、T2 の `auth` の spec(`## Design` つき、REQ 9 件)ができた。進捗の質問にも答えた |
| 3. 並列レビューと承認 | 動作。4 観点の指摘が反映され、`.sdd/review-auth.md` に記録されて承認(`lock auth: ok`)された |
| 4. 実装 | 動作。REQ 11 件が Red → Green になり、gate PASS、コミットまで完了した |
| 5.1 inventory | 動作。gate PASS(23 REQ)、コミット済み |
| 5.2 order-create | 動作。並列レビューのあと、gate PASS(34 REQ)、コミット済み |
| 5.3 order-fulfil | 動作。遷移を数え上げ、gate PASS(44 REQ)、コミット済み |
| 5.4 order-cancel | 動作。gate PASS(54 REQ、5 機能のロックはすべて `ok`)、コミット済み。`plan` は `next: (all features done)` |
| 6. 実装の確認 | 動作。gate の結果と、確認していないことが報告された |
| 7. コンテナー | 動作。レジストリに届かないため、ローカルの `alpine` に切り替え、55 件のテストが通った。curl で認証、商品登録、注文作成(在庫 10 → 7)、支払い、出荷、出荷済みのキャンセル(409)、別注文のキャンセル(在庫 7 に復帰)を確認し、後片付けも済んだ |

再実験では、本文の記録と異なる点がありました。

- **spec と件数は実行ごとに変わります。** 再実験の REQ は計 54 件でした(auth 11、inventory 12、order-create 11、order-fulfil 10、order-cancel 10)。レビューの指摘は auth で 25 件でした。機能名も `order-fulfil` になりました。本文の件数や名前と一致しなくてかまいません。
- **weak Red は出ないことがあります。** 再実験の gate は、すべて通常の Red → Green でした。
- **レビューの記録は、上書きされませんでした。** 5.2 のプロンプトには指示を書いていませんが、エージェントは機能ごとに `.sdd/review-<機能名>.md` を作りました。本文のつまずきは、起きないこともあります。
- **前の機能の spec を直さずに済むことがあります。** 再実験の order-cancel では、`order-fulfil` の spec は変わらず、既存テストの 1 件(`TEST-FUL-005`)だけを更新して、gate が通りました。再承認が必要になるのは、T2 の spec を直した場合です。
- **Dockerfile は、コミットされませんでした。** §7 のプロンプトは、コミットを頼んでいません。ビルド用のファイルは、Dockerfile、`.dockerignore`、`.gitignore` の追記として、作業ツリーに残りました。ホストで取得した Node.js は、後片付けで削除されます。本文は、この点を直しました。
- **本文を直した箇所:** §6 の「確認していないこと」の例から、再現しない `src/index.js` の記述を外し、§7 の注記に、Dockerfile の依存物とコミットの扱いを書きました。
