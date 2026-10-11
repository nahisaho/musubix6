# チュートリアル 5: 複数サービスの連携と契約を、慎重に開発する(注文サービスと決済サービス)

[チュートリアル 2](tutorial-app-development-2.md) では、1 つのアプリを複数の機能に分けて開発しました。このチュートリアルでは、**2 つのサービスが HTTP で協調する**ときの開発を扱います。主題は 3 つです。サービスの間の約束(契約)を固定すること。片方が落ちたときの挙動を決めること。契約を変えたときの影響を追うことです。

| | チュートリアル 2 | このチュートリアル |
|---|---|---|
| 題材 | 在庫つきの注文受付 HTTP API(1 つのアプリ) | 注文サービスと決済サービス(2 つのアプリが localhost の HTTP で連携) |
| 規模 | 5 機能(REQ 46 件) | **7 機能**(REQ 63 件、記録時)、**4 つのプロジェクト**(contract、2 サービス、結合テスト) |
| 区分 | T2 | T2 |
| 新しく使うもの | 機能の分割、`## Design`、並列レビュー、再承認 | 共有の**契約**(JSON スキーマとゴールデンファイル)、`(test-only)` の要件、モックと実プロセスのテストの使い分け、**`projects` と `dependsOn`** によるモノレポの `gate --changed`、サービスをまたぐ**影響分析**、**冪等な課金と再試行** |
| コンテナー | 1 つのコンテナーで API を動かす | 2 つのコンテナーをつなげるか試し、**仕様上つなげられない**ことを確認して 1 つに切り替える |

ここに載せたプロンプトと結果は、`/tmp/musubix6-tutorial-5/shop-services` で実際に開発したときの記録です(Node.js 24、Copilot CLI)。本編のプロンプトは 13 回です。つまずいたときの追加の依頼は、§10 に載せています。件数と機能名は、実行のたびに変わります(§13 を参照)。

## 進め方の約束

- チュートリアル 2 と同じです。読者は、**プロンプトを入力すること**と、**質問に答えること**だけを行います。
- **プロンプトにスキル名は不要です。** 内容に合わせて、エージェントが必要なスキルを選びます。
- 「エージェントが実行すること」は、内部の作業の記録です。読者は実行しません。
- 質問の回答は、本来は対話で返します。ここでは非対話で検証したため、プロンプトに「おまかせ」と書いています。
- spec の内容は、実行のたびに変わります。件数や文言は、本文の例と一致しなくてかまいません。
- 並列レビューの途中経過は、ログに混ざって表示されることがあります。結果は `.sdd/review-<機能名>.md` と、エージェントの最後の報告で確認します。

## 0. 前提条件

チュートリアル 2 の前提条件と同じです。§9 でも、WSL 2.9.3 以降の `wslc.exe` を使います。作業ディレクトリで Copilot CLI を起動します(ここだけ読者が操作します)。

```sh
mkdir -p /tmp/musubix6-tutorial-5/shop-services && cd /tmp/musubix6-tutorial-5/shop-services
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

チュートリアル 2 と同じ依頼です。エージェントは、先に `package.json` を作ってから SDD を初期化するよう、自分で順序を直しました。

## 2. 機能に分割して、順序を決める

最初のプロンプトで、構成の条件をすべて伝えます。モノレポであること、サービスごとに独立した `package.json` を持つこと、契約を `contract/` に置くこと、障害時の扱いを決めたいことです。

### 入力プロンプト

```text
小さな店向けに、注文サービスと決済サービスの 2 つの HTTP サービスを作りたい。どちらも依存パッケージなしの Node.js(ESM)で、1 つのリポジトリ(モノレポ)に置く。注文サービスは services/orders、決済サービスは services/payments に置き、それぞれ独立した package.json を持つ。注文サービスは注文を受け付け、支払いのために localhost の HTTP で決済サービスを呼ぶ。決済サービスは課金を受け付け、同じ冪等キーの再送では二重に課金しない。2 つのサービスの間の約束(リクエストとレスポンスの JSON スキーマ、およびゴールデンファイル)は contract/ に置き、両方のサービスがそれに対してテストされるようにしたい。決済サービスが落ちている場合や遅い場合の扱いも決めたい。
機能が多いので、機能に分割して、作る順序と依存関係を決めて。そのあと、最初の機能の要件定義書を作って(ヒアリングは「おまかせ」で推奨値)。
```

結果は、次の `.sdd/plan.md` です(エージェントは最初に 6 機能へ分けました。§5.1 で 1 機能が増えます)。

```md
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | contract | - | contract/ schemas, golden files, dependency-free validator; both services test against it |
| 2 | payments-charge | contract | POST /charges, validation, error shape, GET /health |
| 3 | payments-idempotency | payments-charge | Idempotency-Key replay returns same result, no double charge; key reuse with other body = 409 |
| 4 | orders-intake | contract | POST/GET /orders, validation, in-memory store; payment client injected (stub) |
| 5 | orders-pay-client | orders-intake, payments-idempotency | HTTP client to localhost payments; timeout, retry with same key, down/slow policy, order states |
| 6 | integration | orders-pay-client | both services started on ephemeral ports; end-to-end + root `npm test` wiring |
```

**契約を最初の機能にして、2 つのサービスの両方がそれに依存する**順序になりました。決済サービス側(2、3)と注文サービス側(4、5)は、互いに依存せず、契約だけを共有します。両側をつなぐ結合テストは、最後です。

最初の `contract` は、**公開される約束**のため T2 と判定されました。REQ は 8 件で、うち 1 件が `(test-only)` です。

```md
| REQ-CONTRACT-006 (test-only) | The system shall provide golden files contract/golden/{charge-request,charge-response-succeeded,charge-response-declined,error-idempotency-conflict}.json, each valid against its schema. | TEST-CONTRACT-006 |
```

`(test-only)` は、**実装コードがなく、ゴールデンファイルのテストだけで確認する要件**の印です。契約のスキーマとゴールデンは JSON であり、`@implements` を付けるコードがありません。この印があれば、gate は「実装が無い」と誤って止まりません。

## 3. 契約を実装する(共有の約束を、最初に固める)

### 入力プロンプト

```text
.sdd/plan.md の次の機能に進んで。2 つのサービスが共有する公開の約束なので、慎重に進めたい。リスクの観点ごとに別々のエージェントで並列にレビューして指摘を反映し、承認して。レビュー結果は機能ごとに別のファイル(.sdd/review-<機能名>.md)に記録して、既存のものを上書きしないで。そのあと実装して(ゴールデンファイルだけで確認する要件は test-only にして)、全体の gate を通して、コミットして。
```

4 つの観点から、**24 件**の指摘が出ました。すべて spec に反映するか、理由つきで見送っています。主なものは次のとおりです。

| 観点 | 重大度 | 指摘 | 対応 |
|---|---|---|---|
| セキュリティ | high | 手書きの検証関数が `__proto__` などの特殊なキーを通す | 自分のプロパティだけを検査する |
| セキュリティ | med | 検証の深さと大きさに上限がなく、巨大な入力で負荷が上がる | 深さの上限を決める |
| 公開インターフェース | med | HTTP の状態コードと契約のエラーコードの対応が未定義 | README に対応表を書く要件(REQ-CONTRACT-009)を追加する |
| テスト | med | 上限と下限(64 文字と 65 文字など)のテストが明記されていない | 境界値をテストの義務にする |
| 公開インターフェース | high | エラーコードに `timeout` と `unavailable` が無い | **見送り**。これらは呼び出し側(注文サービス)の条件であり、決済サービスが返す応答ではない |

```text
SDD GATE PASS
✓ lock contract: ok [ai, review file]
✓ trace: 9 REQ, 0 errors, 5 warnings
✓ ledger: 18 entries, chain intact
✓ tdd evidence: 9/9 tests Red→Green
✓ cmd test (0.3s)
```

警告 5 件は、`@implements` を付けられない REQ(スキーマと README だけが実体のもの)です。テストでは検証されているため、gate は通ります。

## 4. プロジェクトの構成を gate に登録する(`projects` と `dependsOn`)

モノレポでは、全体のテストを毎回すべて実行すると遅くなります。`gate --changed` は、**変更に関係するプロジェクトだけ**を検査します。そのために、プロジェクトの一覧と、プロジェクト間の依存を設定に書きます。

### 入力プロンプト

```text
このモノレポの構成を整えたい。contract、services/payments、services/orders をそれぞれ独立したプロジェクトとして扱い、各プロジェクトのテストはそのディレクトリで実行されるようにして。services/payments と services/orders は contract/ に依存するので、contract/ だけを変更したときも、変更した部分に絞った gate で両方のサービスのテストが走るようにして。services の 2 つのパッケージは、まだ中身のない骨組み(package.json と test/ のディレクトリ)でよい。設定を変えたら、全体の gate が通ることを確認して、コミットして。
```

`.sdd/config.json` に、次の `projects` が書かれました(要点だけを示します)。

```json
"projects": [
  { "root": "contract", "checks": [{ "name": "test", "cmd": ["npm", "run", "test"] }] },
  { "root": "services/payments", "dependsOn": ["contract"], "checks": [ … ] },
  { "root": "services/orders",   "dependsOn": ["contract"], "checks": [ … ] }
]
```

```text
✓ cmd contract:test (0.3s)
✓ cmd services/payments:test (0.2s)
✓ cmd services/orders:test (0.2s)
```

エージェントは、`contract/README.md` だけを変えて `gate --changed` を実行し、3 つのプロジェクトすべてが走ることを確かめてから、変更を戻しました。`dependsOn` に書いた `contract` が、サービス側のテストを呼び出しています。

> **ポイント**
> `dependsOn` は、**直接の依存だけ**に効きます。§7 で、この性質が穴になる場面が出ます。

## 5. 決済サービスと注文サービスを作る

### 5.1 決済サービスの課金(payments-charge)

### 入力プロンプト

```text
次の機能に進んで。契約(contract/)に対して、決済サービス側の応答がテストされることが重要なので、慎重に進めたい。要件定義書を作り(ヒアリングは「おまかせ」で推奨値)、リスクの観点ごとに別々のエージェントで並列にレビューして指摘を反映し、承認して。レビュー結果は機能ごとに別のファイル(.sdd/review-<機能名>.md)に記録して、既存のものを上書きしないで。そのあと実装して、全体の gate を通して、コミットして。
```

`POST /charges` と `GET /health` が、REQ 13 件でできました。テストは**本物の HTTP**で決済サービスを呼び、応答を `contract/` のスキーマとゴールデンに突き合わせます。これが、提供側(provider)の契約テストです。指摘は 22 件でした。

```text
✓ lock payments-charge: ok [ai, review file]
✓ trace: 22 REQ, 0 errors, 5 warnings
✓ tdd evidence: 22/22 tests Red→Green
```

見送った指摘は 2 件で、理由はレビューの記録にあります。同じ冪等キーの扱いは次の機能へ回しました。そのため、この時点では同じキーでも毎回新しい課金になります。

### 5.2 同じ冪等キーでは二重に課金しない(payments-idempotency)

最も重要な性質を、プロンプトに明記します。

### 入力プロンプト

```text
次の機能に進んで。注文サービスが再送しても二重に課金されないこと(同じキーなら同じ結果を返すこと)が最も重要なので、慎重に進めたい。同時に届いた同じキーのリクエストも考慮して。要件定義書を作り(ヒアリングは「おまかせ」で推奨値)、リスクの観点ごとに別々のエージェントで並列にレビューして指摘を反映し、承認して。レビュー結果は機能ごとに別のファイル(.sdd/review-<機能名>.md)に記録して、既存のものを上書きしないで。そのあと実装して、全体の gate を通して、コミットして。
```

次の挙動が仕様になりました。

- 同じキーで同じ内容なら、**200 で同一の応答を返し**、二重に課金しない。
- キーが同じでも内容が違えば、409 を返す。
- 同時に届いた同じキーのリクエストでは、課金処理が 1 回だけ実行される。待たされたリクエストは、同じ結果を受け取る。
- 課金処理が失敗したら、キーを解放して 500 を返す。
- キーの保存数と待機数には、上限がある。満杯のときは 503 を返す。

同時実行のテストは、**外から解放できる遅延した Promise** で決定的に書かれました。タイミングに頼るテストは、不安定になるためです。

```text
✓ lock payments-idempotency: ok [ai, review file]
✓ trace: 31 REQ, 0 errors, 6 warnings
✓ tdd evidence: 31/31 tests Red→Green
✓ cmd services/payments:test (1.1s)
```

既存の課金テストが同じキーを使い回していたため、エージェントは、キーを呼び出しごとに変えるよう直しました。直したテストの証跡は、`tdd refactor` で再記録されています。

### 5.3 注文サービスの受付と、決済サービスのモック(orders-intake)

注文サービスの**単体テスト**では、決済サービスの本物を使いません。モックの決済サービスに対して、リクエストが契約に合っていることと、契約どおりの応答を受け取ったときの動きを検証します。

### 入力プロンプト

```text
次の機能に進んで。注文サービスの単体テストでは、決済サービスを本物は使わずにモックして、リクエストが契約(contract/)に合っていることと、契約どおりの応答を受け取る場合を検証する方針にしたい。要件定義書を作り(ヒアリングは「おまかせ」で推奨値)、リスクの観点ごとに別々のエージェントで並列にレビューして指摘を反映し、承認して。レビュー結果は機能ごとに別のファイル(.sdd/review-<機能名>.md)に記録して、既存のものを上書きしないで。plan.md にない機能は、勝手に増やさないで。そのあと実装して、全体の gate を通して、コミットして。
```

> **つまずいた点: plan にない機能が作られた**
> 記録では、このプロンプトの最後の 1 文がありませんでした。エージェントは「モック」を独立した機能と解釈して、plan にない `orders-payment-mock` を作りました。gate は通りましたが、`plan` には「spec is not in plan.md」と出ます。§10 の依頼例で、plan を直しました。プロンプトに「plan.md にない機能は、勝手に増やさないで」と書けば、避けられます。

モックは、`services/orders/test/helpers/mock-payments.mjs` に置かれました。**契約に合わないリクエストを受け取ると、例外を投げる**モックです。つまり、モックが契約の番人になります。注文サービスの実装が契約を破れば、モックが先に失敗します。

```text
✓ lock orders-payment-mock: ok [ai, review file]
✓ trace: 38 REQ, 0 errors, 8 warnings
✓ tdd evidence: 38/38 tests Red→Green, 1 weak Red (1 characterization: passed without a failing Red)
```

`weak Red (characterization)` は、モック自身を検証するテストです。実装の前から通るため、「既存の挙動を固定するテスト」として記録されました。

## 6. 障害時の挙動を決める(orders-pay-client)

決済サービスが落ちている、遅い、応答が途中で切れる、という場面の扱いを、要件にします。

### 入力プロンプト

```text
.sdd/plan.md の次の機能に進んで。決済サービスが落ちている、遅い、応答が途中で切れる場合の扱いが最も重要。タイムアウトしたときは、同じ冪等キーで再試行しても二重に課金されないことを前提に、再試行の回数と間隔、最終的に注文がどの状態になるかを決めて要件にして。注文サービスが実際に動く HTTP サーバーとして起動できるようにもして。要件定義書を作り(ヒアリングは「おまかせ」で推奨値)、リスクの観点ごとに別々のエージェントで並列にレビューして指摘を反映し、承認して。レビュー結果は機能ごとに別のファイル(.sdd/review-<機能名>.md)に記録して、既存のものを上書きしないで。決済サービスの単体テストでは本物を使わず、モックの決済サービスを使って。plan.md にない機能は、勝手に増やさないで。そのあと実装して、全体の gate を通して、コミットして。
```

「おまかせ」で選ばれた方針は、次のとおりです。

| 項目 | 方針 |
|---|---|
| 試行回数 | 最大 3 回(1 回目 + 再試行 2 回) |
| 待ち時間 | 2 回目の前に 200ms、3 回目の前に 400ms。1 回ごとのタイムアウトは 2000ms |
| 再試行する条件 | 結果が**不明**なとき(停止、遅延、途中で切断、5xx)だけ |
| 冪等キー | 全試行で同じ `order-<orderId>` を使う。別のキーでの再送は禁止 |
| 最悪の応答時間 | `POST /orders` の応答まで 6.6 秒 |

注文の最終状態は、4 つに決まりました。

| 状態 | 意味 |
|---|---|
| `paid` | 決済に成功した(再試行や、200 の再生を含む) |
| `payment_declined` | 決済が拒否された |
| `payment_failed` | 決済サービスが 400 や 409 で拒否した。課金はなく、再試行もしない |
| `payment_unconfirmed` | 3 回とも結果が不明、または契約違反の応答。**課金済みかもしれない**ため、自動ではキャンセルしない |

`payment_failed` ではなく `payment_unconfirmed` にした理由は、spec の `## Design` に書かれました。タイムアウトは、課金されていないことの証明にならないためです。「失敗」と呼ぶと、別のキーで二重に課金する手作業を招きます。

> **ポイント**
> 再試行が安全なのは、決済サービスが同じキーを再生するからです。この**サービスをまたぐ前提**は、決済サービスの spec(REQ)と、注文サービスの spec の両方に書かれました。前提が崩れると、二重課金になります。

テストは、2 つの層に分かれました。

- **単体テスト**: 契約を強制するモックだけを使います。ソケットを開かないことも、テストで確かめます。リトライの回数、待ち時間、状態の遷移を、本物の時間を使わずに検証します。
- **HTTP 送信部分のテスト**: ローカルに立てた擬似サーバー(停止、無応答、途中で切断、巨大な応答)で確認します。

```text
✓ lock orders-pay-client: ok [ai, review file]
✓ trace: 54 REQ, 0 errors, 10 warnings
✓ tdd evidence: 54/54 tests Red→Green, 2 weak Red (2 characterization: passed without a failing Red)
✓ cmd services/orders:test (7.3s)
```

この機能は、既存の spec(`orders-intake` の REQ 4 件など)を改訂しました。レビューの記録は、既存のファイルへ**追記**され、上書きはされませんでした。

## 7. 本物の 2 プロセスで、結合テストをする

モックを使った単体テストは、モックが本物と食い違うと、何も検出できません。そこで、**注文サービスと決済サービスを、別々のプロセスとして実際に起動**して確認します。

### 入力プロンプト

```text
.sdd/plan.md の次の機能に進んで。注文サービスと決済サービスを、本物の別々のプロセスとして起動して(ポートは空いているものを自動で選ぶ)、HTTP でつないで確認する結合テストを作りたい。決済の成功と拒否、決済サービスが停止しているとき、起動が遅れて再試行で成功するとき、同じ注文の二重課金が起きないこと、を確認して。結合テストの中で使う起動の手段は、決済サービスにも用意して。要件定義書を作り(ヒアリングは「おまかせ」で推奨値)、リスクの観点ごとに別々のエージェントで並列にレビューして指摘を反映し、承認して。レビュー結果は機能ごとに別のファイル(.sdd/review-<機能名>.md)に記録して、既存のものを上書きしないで。plan.md にない機能は、勝手に増やさないで。そのあと実装して、全体の gate を通して、コミットして。
```

結果は、`integration/` の 8 本のテストです。決済の成功と拒否、停止中、遅れて起動、二重課金の防止を、実プロセスで確認します。決済サービスには `services/payments/start.mjs` が追加されました。

```text
✓ lock integration: ok [ai, review file]
✓ trace: 62 REQ, 0 errors, 14 warnings
✓ tdd evidence: 62/62 tests Red→Green, 7 weak Red …
✓ cmd contract:test (0.2s)
✓ cmd services/payments:test (1.0s)
✓ cmd integration:test (2.8s)
✓ cmd services/orders:test (7.4s)
```

エージェントが報告した、実際に見つけた制約です。

- **拒否のテストだけ、テスト専用の決済サービスを使います。** 決済サービスの標準の処理は、注文 ID の先頭が `decline-` のときだけ拒否します。注文サービスが採番する ID は `ord-NNNN` なので、標準の処理では、注文サービス経由で拒否を起こせません。本番のコードを変えずに、テスト専用の起動スクリプトを使うことにしました。
- **「遅れて起動」のテストは、負荷に弱い**可能性があります。ホストの負荷で起動が約 0.6 秒を超えると、失敗することがあります。
- Node 24 では、ディレクトリを引数にした `node --test` が使えません。そこで、ルートの `npm test` は、スイートごとに引用符つきの glob を並べる形になりました。

## 8. 契約を変えたときの影響を調べ、実際に変える

ここが、このチュートリアルの山場です。まず、**変更せずに**影響範囲を尋ねます。

### 8.1 影響分析を依頼する

### 入力プロンプト

```text
契約(contract/)の課金レスポンスに、課金した時刻を表す必須の項目 processedAt(ISO 8601 の文字列)を追加したいと考えている。まだ変更はしないで。この変更で影響を受ける要件、テスト、ファイルを、決済サービスと注文サービスの両方について教えて。どのテストが壊れる見込みかも教えて。
```

エージェントは、変更せずに、要件、ファイル、壊れるテストを一覧にしました(抜粋)。

| 層 | 影響を受ける要件 | 影響を受けるファイル | 壊れる見込みのテスト |
|---|---|---|---|
| 契約 | REQ-CONTRACT-003、006、007、009 | `charge-response.schema.json`、ゴールデン 2 つ、`README.md` | `contract.test.mjs` の必須項目の比較 |
| 決済 | REQ-PAYCHG-003、004、005、REQ-PAYIDEM-001 | `services/payments/src/server.mjs` | ゴールデンとの完全一致のテスト(時刻が毎回変わる) |
| 注文 | REQ-ORDPAYMOCK-003、004、006、REQ-ORDPAY-003 | `services/orders/src/payment-client.mjs`(応答の項目数を 5 と決め打ちしている) | 手書きの 5 項目の応答を使うテスト |
| 結合 | REQ-INTEG-003、004、007 | `integration/helpers/payments-decline.mjs` | 再送の本文を完全一致で比べるテスト |

あわせて、設計上の注意が 2 つ出ました。

- 契約の検証関数は `format` に対応していません。`"format": "date-time"` をスキーマに書くと、検証関数が失敗します。
- 200 の再送では、本文が同一でなければなりません。`processedAt` は、**初回に確定した値を保存して返す**必要があります。

> **注意: 影響分析の限界**
> スクリプトの `impact` を `REQ-CONTRACT-003` に使うと、`reaches 0 file(s) via imports` と出ます。サービスは、スキーマを JSON として読み込むだけで、`import` でたどれないためです。サービスをまたぐ影響は、エージェントが `grep` と spec の読み込みで調べた結果です。**依頼するときは、「どの要件とテストに影響するか」を日本語で尋ねる**のが確実です。

### 8.2 契約を実際に変える

### 入力プロンプト

```text
先ほど調べた契約の変更を、実際に行って。課金レスポンスに、必須の項目 processedAt(ISO 8601 の文字列)を追加する。進め方は次のとおり。
1. 先に契約(contract/)の仕様・スキーマ・ゴールデンだけを変えて、変更した部分に絞った gate(gate --changed)を実行し、どのプロジェクトのテストが走って、何が失敗したかを教えて。
2. 影響を受ける要件の仕様を直し、観点ごとに別々のエージェントで並列にレビューして指摘を反映し、再承認して。レビュー結果は既存のファイルに追記し、別の機能のものを上書きしないで。
3. 決済サービスと注文サービスの実装とテストを直して、全体の gate を通して、コミットして。
決済サービスと注文サービスの両方が、新しい契約に追従していることを、実際の別プロセスの結合テストでも確認して。
```

**手順 1 の結果(契約だけを変えた時点の `gate --changed`)**

| プロジェクト | 結果 |
|---|---|
| contract | 失敗: `TEST-CONTRACT-003`、`006` の 2 件。契約の承認と、REQ-CONTRACT-003 と 005 の証跡も古い(stale)状態になった |
| services/payments | 失敗: `TEST-PAYCHG-003`、`005`、`006` の 3 件 |
| services/orders | 失敗: ORDPAY、ORDPAYMOCK、ORDINTAKE の約 10 件 |
| integration | **走らなかった**(変更ファイルなしとして、スキップされた) |

**契約を変えると、契約のテストだけでなく、両方のサービスのテストが失敗する**ことを、実際に確認できました。これが契約テストの価値です。変更が片方のサービスにしか反映されていなければ、すぐに検出できます。

手順 2 では、5 つの spec(contract、payments-charge、payments-idempotency、orders-payment-mock、integration)が改訂されました。そのあと、並列レビューと再承認が行われました。追加のレビューで REQ-INTEG-010 が増え、integration と orders-payment-mock は 2 回、承認し直しました。レビューで見つかった主な問題は、次のとおりです。

- 時刻の正規表現が、`2026-02-31` のような暦として不正な値を通す。
- `toISOString()` が返す、4 桁を超える年を扱えない。

対応として、契約の検証関数に `pattern` を追加しました。注文サービスは、2 月 31 日や 13 月のような値を、暦として検証します。決済サービスは、時計を差し替えられるようにして、`processedAt` を**処理時に 1 回だけ**設定します。再生では、同じ値を返します。

別プロセスの結合テストでは、次のことを確認しました。

- 本物の決済サービスが、時刻の範囲内で、形式の正しい `processedAt` を返す。
- 再生でも、同じ `processedAt` が返る。
- 旧形式(項目なし)や不正な値を返す偽の決済サービスに対して、注文サービスが `payment_unconfirmed` にして、再試行しない(TEST-INTEG-010)。

```text
SDD GATE PASS
✓ lock contract: ok [ai, review file]
✓ lock integration: ok [ai, review file]
…
✓ trace: 63 REQ, 0 errors, 15 warnings
✓ ledger: 251 entries, chain intact
✓ tdd evidence: 63/63 tests Red→Green, 4 weak Red … (3 characterization …)
```

### 8.3 `gate --changed` の抜けを直す

手順 1 で、`integration` が**走らなかった**ことに気づきました。結合テストは契約にも依存するのに、`dependsOn` に `services/orders` と `services/payments` しか書かれていなかったためです。`dependsOn` は、間接の依存をたどりません(§4 のポイント)。

### 入力プロンプト

```text
contract/ だけを変更したとき、gate --changed で結合テスト(integration)が走らなかった。結合テストは契約にも依存しているので、設定を直して。contract/README.md に空行を 1 つ足すだけの変更で、contract、両方のサービス、integration のすべてのテストが走ることを確認して(確認後は変更を戻して)。直したらコミットして。
```

`integration` の `dependsOn` が、`["contract", "services/orders", "services/payments"]` になりました。`contract/README.md` に空行を足して `gate --changed` を実行すると、4 つのプロジェクトのテストがすべて走りました。

```text
✓ cmd contract:test (0.2s)
✓ cmd services/payments:test (1.0s)
✓ cmd integration:test (3.1s)
✓ cmd services/orders:test (7.3s)
```

この設定は、結合テスト自身の spec(REQ-INTEG-008)でも固定されていました。そのため、エージェントは、テストと spec を直して、承認し直しています。

## 9. WSLC のコンテナーで、2 つのサービスを動かす

### 入力プロンプト

```text
注文サービスと決済サービスを WSLC のコンテナーにして、コンテナー内で全体のテストを実行して。そのあと、2 つのコンテナーをネットワークでつないで起動できるか試して。ポートは注文サービスだけを公開して、この環境から curl で、注文の作成(成功)、決済サービスを止めたときの注文の状態、決済サービスを再開したあとの動作を確認して。仕様(セキュリティ上の制約を含む)は変えないで。ネットワークでつなぐことが仕様上できない場合は、1 つのコンテナーで両方を動かす方法に切り替えて、理由も教えて。後片付けもして。ビルドに使った Dockerfile はリポジトリに残して、gate が通ることも確認して、コミットして。
(補足: この環境ではコンテナーからレジストリに届かないので、公式イメージが使えない場合は、ローカルのイメージ alpine と、ホストで取得できるものだけでビルドする方法に切り替えて。他の用途のコンテナーやイメージには触らないで。)
```

結果は次のとおりです。

| 確認 | 結果 |
|---|---|
| 公式の `node` イメージ | レジストリに届かず取得できない。ローカルの `alpine:3.20` に、ホストの `node` と、必要なライブラリを載せる方法に切り替えた |
| コンテナー内のテスト | **63 件が成功** |
| 2 つのコンテナーをネットワークでつなぐ | **できない**(下記) |
| 1 つのコンテナーで両方を起動 | 動作した |
| 注文の作成 | 201、状態は `paid` |
| 決済サービスを止めた状態の注文 | 201、状態は `payment_unconfirmed`。その後も `payment_unconfirmed` のまま(再照合は仕様の対象外) |
| 決済サービスを再開したあとの注文 | `paid` |

**2 つのコンテナーをつなげない理由**は、契約ではなく、**サービスの仕様**にあります。

- 決済サービスは、`PAYMENTS_HOST=0.0.0.0` での起動を拒否します。
- 注文サービスは、`PAYMENTS_URL=http://payments:3001` を拒否します。接続先を、リテラルの `127.0.0.1` か `[::1]` に限っているためです(名前解決で、課金のリクエストの宛先が変わらないようにする設計です)。

> **制限の明記**: このチュートリアルの仕様は、ループバック限定が既定です。2 つのコンテナーをつなぐには、仕様側に「明示的な許可(オプトイン)」が必要です。たとえば、待ち受け先は `ALLOW_NON_LOOPBACK_BIND=1` のときだけ非ループバックを許し、接続先は許可リスト(`PAYMENTS_ALLOWED_HOSTS`)にある名前だけを許します。
> WSLC では、**既定の `bridge` ネットワークではコンテナー名を解決できません**。名前で接続するには `wslc network create <name>` で作ったネットワークに両方のコンテナーを参加させます(IP での接続は、どちらでも可能です)。同じ構成の最小の再現(2 コンテナー、注文の成功、決済サービス停止中の `payment_unknown`、再開後の成功、決済サービスを公開しないこと)は、WSLC 3.0.3.0 で確認済みです。

エージェントは、この制約を**緩めず**、仕様の範囲で、1 つのコンテナーに切り替えました。

- 決済サービスは `127.0.0.1:3001`、注文サービスは `127.0.0.1:3100` で待ち受けます(どちらもループバックのまま)。
- 公開する 3000 番ポートは、小さな中継スクリプト(`docker/forward.mjs`)が受けて、注文サービスへ渡します。
- 起動は `docker/run-both.sh` が行います。決済サービスのプロセス ID を保存して、外から止めたり再開したりできます。

`Dockerfile`、`docker/run-both.sh`、`docker/forward.mjs` は、リポジトリに残りました。後片付けでは、作ったコンテナー、ネットワーク、イメージ、ビルド用の一時ディレクトリ(`.build-stage/`)が削除されました。もともとあった別のコンテナーとイメージには、触れていません。

> **つまずいた点**: この Dockerfile は、ホストの `node` と共有ライブラリを `.build-stage/` にコピーしてからビルドします(手順は Dockerfile の冒頭のコメントにあります)。公式イメージが使える環境では、`FROM node:24-alpine` で足ります。

## 10. つまずいたときの依頼例

| 症状 | 原因 | 依頼の例 |
|---|---|---|
| `plan` に「spec is not in plan.md」と出る | エージェントが、plan にない機能を作った | 「開発の進捗と、次に作る機能を教えて。plan に載っていない機能があれば、plan に反映して、残りの機能の分担も整理し直して。変更したらコミットして」 |
| `plan` に「plan.md row ignored」と出る | plan.md に補足の表を足したため、機能の表と見分けられない | 「plan.md には機能の表を 1 つだけ置き、補足の表は箇条書きにして。警告が消えたことを確認して、コミットして」 |
| `gate --changed` で、一部のプロジェクトが走らない | `dependsOn` に、間接の依存が書かれていない | 「contract/ だけを変更したとき、integration が走らなかった。設定を直して。空行を 1 つ足すだけの変更で、すべてのテストが走ることを確認して」 |
| 契約を変えたら、両方のサービスのテストが失敗した | 契約テストが、変更の波及を検出した(想定どおり) | 「影響を受ける要件の仕様を直し、再レビューして、再承認して。そのあと、両方のサービスの実装とテストを直して」 |
| 2 つのコンテナーをつなげない | 注文サービスと決済サービスが、ループバックの宛先に限る仕様になっている | 「仕様は変えずに、1 つのコンテナーで両方を動かす方法に切り替えて、理由も教えて」 |
| コンテナーのビルドが `network is unreachable` で失敗する | コンテナーからレジストリに届かない | 「ローカルのイメージだけでビルドする方法に切り替えて」 |

## WSL Container(WSLC)特有の制限事項

§9 は Docker ではなく WSLC(`wslc`、検証は 3.0.3.0)を使います。次の違いに注意してください。

- **コマンドが Docker と異なります。** `docker compose` はありません。`wslc inspect` は JSON のみで、Go テンプレートは使えません。`--format` は `json` か `table` だけです。不明な場合は `wslc <command> -?` で確認します。
- **既定の `bridge` ネットワークでは、コンテナー名を解決できません**(IP では到達できます)。名前で接続するには、`wslc network create <name>` で作ったネットワークに、両方のコンテナーを `--network <name>` で参加させます。別名は `--network-alias` で付けます。
- **ネットワークが異なるコンテナー同士は通信できません。** 後から参加させるには `wslc network connect <network> <container>` を使います。
- **コンテナー間の通信に `-p` は要りません。** `-p` はホストからの公開用です。決済サービスは公開せず、注文サービスだけを公開します。
- **公式イメージを取得できないことがあります。** レジストリに届かない環境では `wslc pull` が失敗します。ローカルの `alpine` にホストの Node.js を載せる方法に切り替えます。
- **仕様の制約は別の問題です。** 名前で接続できても、本編のサービスは既定でループバック以外を拒否します。つなぐには、仕様側のオプトインが必要です(§9 の注記)。

## 11. 完成した成果物

```text
shop-services/
├── .sdd/
│   ├── plan.md                           7 機能の順序と依存
│   ├── specs/                            contract, payments-charge, payments-idempotency,
│   │                                     orders-payment-mock, orders-intake, orders-pay-client, integration
│   ├── review-<機能名>.md                 機能ごとの観点別レビュー
│   ├── config.json                       projects と dependsOn
│   └── approvals.json, tdd.jsonl         承認とロック、Red/Green の証跡
├── contract/                             schemas/、golden/、validate.mjs、README.md、test/
├── services/
│   ├── payments/                         src/server.mjs、start.mjs、test/
│   └── orders/                           src/、transport/、start.mjs、test/(helpers/mock-payments.mjs)
├── integration/                          別プロセスの結合テストと、起動の補助
├── docker/                               run-both.sh、forward.mjs
└── Dockerfile
```

コミット履歴です。

```text
build: Dockerfile and single-container runner for orders and payments
Make integration project depend on contract in sdd config
feat(contract): require processedAt (ISO 8601) in the charge response
feat(integration): orders and payments as separate processes, end-to-end tests, payments start script
feat(orders): HTTP payment transport, retry with same idempotency key, order payment states, orders HTTP server
feat(orders): intake handler for POST/GET /orders with in-memory store
Use bullets for supplementary list in plan.md
docs(plan): add orders-payment-mock, split payment client work, add status
feat(orders): payment client unit-tested against a contract-enforcing payments mock
feat(payments): idempotent POST /charges (replay 200, conflict 409, concurrent same-key)
feat(payments): POST /charges and GET /health verified against contract
Split monorepo into contract and services projects with scoped gate
feat(contract): shared orders/payments schemas, goldens, validator
Initial commit: Node.js ESM app skeleton, musubix6 skills, SDD init
```

## 12. 次のステップ

- 決済の状態が `payment_unconfirmed` のまま残る注文を、後から決済サービスに問い合わせて確定する処理(再照合)は、仕様の対象外です。次の機能の候補です。
- 状態はメモリ上にあります。決済サービスが再起動すると、冪等キーが消えて、再試行の間の再起動で二重に課金する恐れがあります。永続化を足すときは、この前提を spec の `## Design` で見直します。
- 実際の決済代行(PSP)につなぐときは、冪等キーを PSP へ渡し、課金処理を原子的にする必要があります。

## 13. 再実験での確認結果

このチュートリアルの本編のプロンプト 13 個を、**一字も変えず**に、空のディレクトリ(`/tmp/musubix6-tutorial-5/rerun/shop-services`)で最初から順に入力しました。結果は次のとおりです。

| 項目 | 再実験の結果 |
|---|---|
| 全 13 プロンプト | すべて実行できた。最後の gate は **PASS**(REQ 52 件、全テストが Red→Green)。コミットは 11 件 |
| 機能の分割 | 6 機能(contract、payments-charge、payments-idempotency、orders-create、orders-payment-client、e2e-integration)。**記録とは件数も名前も違う**が、順序と依存の形は同じ(契約が先頭、両サービスは契約だけに依存、結合テストが最後) |
| `(test-only)` | `contract` の spec に 2 件付いた(ゴールデンの存在と、ゴールデンの契約への適合) |
| §5.3 の「plan にない機能を増やさない」の 1 文 | **効いた**。plan にない機能は作られず、`plan` に警告は出なかった。決済サービスのモックは、注文サービス側の機能に含まれた |
| §6 の方針 | 同じ冪等キーでの再試行と、結果不明の注文を `payment_unknown` にする方針になった(状態の名前は記録と違う)。自動でキャンセルしない点は同じ |
| §8.1 の影響分析 | 要件、ファイル、壊れるテストの一覧が返った。変更はされなかった。`validCharge` の項目数の決め打ちなど、記録と同じ種類の指摘も出た |
| §8.2 の契約変更 | 手順 1 の `gate --changed` で、contract、payments、orders のテストが失敗した。5 つの spec が改訂され、再レビューと再承認を経て、全体の gate が PASS になった。契約のバージョンは 2.0.0 に上がった |
| §8.3 の抜け | **同じ症状が再現した。** 手順 1 で結合テストが走らなかった。原因も同じで、結合テストが `dependsOn` に契約を持たなかった。再実験では、結合テストがルートの `test/` にあったため、`test` という名前のプロジェクトとして登録された |
| §9 のコンテナー | 2 つのコンテナーをつなげない結果が同じになった(決済サービスは `HOST=0.0.0.0`、注文サービスは `PAYMENTS_URL=http://payments:3000` を拒否)。1 つのコンテナーで、注文の成功、決済サービス停止中の `payment_unknown`、再開後の成功を確認できた |

### 記録と違った点

- **件数、機能名、ファイルの配置は、実行のたびに変わります。** 再実験では、結合テストが `integration/` ではなくルートの `test/` に置かれました。本文の件数や名前は、記録時のものです。
- **§6 のプロンプトは、時間がかかります。** 記録では約 8 分半でした。再実験では、非対話の実行に設けた 590 秒の制限を超えました。エージェントの処理は制限のあとも続き、コミットまで終わりました。次のプロンプトに進む前に、`git log` と gate で完了を確認してください。完了していなければ、「前の作業の続きから、gate を通してコミットして」と依頼します。
- **コンテナーの Node.js は、ホストのものです。** 再実験では Node 22 が使われ、記録では、ホストの Node.js と glibc のライブラリでした。どちらもローカルの `alpine` に載せる方法で、動作は同じでした。

### 確認していないこと

- §8.1 の `impact` スクリプトが `reaches 0 file(s)` を返す点は、記録時のみの確認です。再実験では、スクリプトを直接は実行していません。
- 本物の `node` イメージが取得できる環境での、`FROM node:24-alpine` の Dockerfile は、試していません。
- 本編のサービス本体で、仕様の制約を緩めて 2 つのコンテナーをつなぐ構成は、試していません。制約を変えない前提だったためです。なお、オプトイン方式の最小サービスでの 2 コンテナー構成は、§9 の注記のとおり確認済みです。
