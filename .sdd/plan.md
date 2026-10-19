# Diagnostics v1: 要件定義と実装順序
対象読者は musubix6 の利用者・開発エージェント・実装担当者です。編集後の診断契約と、実装前に確かめる条件を共有します。
更新日: 2026-10-19。全要件は初期版必須、tier: T2、approval: auto。ユーザーとの10回の確認に基づき、仕様ロック・初期実装・対象回帰・独立実装レビューを実施しました。修正後の変更対象gateは、設定済み全npmテストを含めてPASSです。全証跡を対象にする `gate`（`--changed` なし）と公開承認は未実施です。

| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | diagnostics-contract | - | CLI・共通結果・実行制御 |
| 2 | diagnostics-typescript | diagnostics-contract | TypeScript 5.9 系・単一 tsconfig |
| 3 | diagnostics-eslint | diagnostics-contract,diagnostics-typescript | ESLint 9 系・flat config。順序2のtsconfig対象選択を再利用 |
| 4 | diagnostics-workflow | diagnostics-contract,diagnostics-typescript,diagnostics-eslint | 開発手順・ラッパー・コピー先・npm 同梱の一貫性 |
この順序表は新規の4機能だけを扱います。既存仕様は順序表の対象外ですが、検証対象からは外しません。`plan` が示す既存仕様の未掲載警告は想定どおりです。仕様の証拠追記後は再レビュー・再ロックします。

## 合意した対象と対象外
主な利用言語は TypeScript・JavaScript・Python・Rust です。共通契約は言語別の診断セットを扱い、初期版は TypeScript セットのみとします。
TypeScript 対応後の次の開発では、Python・Rust に加え、tsconfig のない JavaScript 単独プロジェクトの診断にも対応します。使用ツール、対応バージョン、受け入れ条件は、その開発の要件定義で決めます。
TypeScript セットは TypeScript と ESLint の両方を必須とします。この条件を将来の JavaScript・Python・Rust セットへ流用せず、それぞれの必須ツールは後続仕様で決めます。初期版に言語自動判定やセット選択オプションはありません。
`musubix6 sdd diagnostics [--root DIR] [--json]` で指定した1プロジェクト全体を診断します。常駐せず、エージェントが編集後に実行します。
既存の TypeScript・ESLint と設定を使います。JavaScript の型検査は tsconfig の `allowJs`・`checkJs` に従い、強制的に有効化しません。
LSP・IDE 接続、変更限定、モノレポ自動横断、project references は対象外です。依存の自動導入、自動修正、キャッシュ、診断履歴の保存も行いません。
初期版は、プロジェクトルートの `tsconfig.json` に含まれるファイルを対象とします。tsconfig 外のファイルまで検査したとは表示しません。
結果は実行時点の診断であり、後から変更されたファイルの状態や動作の正しさは保証しません。診断を TDD の Red・承認証跡・最終 gate の代わりにしません。

## 設計・受け入れの共通方針
診断処理は既存 CLI から呼ぶ独立モジュールとし、TypeScript、ESLint の順で別プロセスを逐次実行します。一方が未完了でも、もう一方の取得を試みます。
子プロセスの状態は pending → running → complete または incomplete の一方向です。未実行を complete にせず、各ツールの結果と全体判定を分けます。
全体判定は、選んだ診断セットの必須providerに incomplete があれば INCOMPLETE/2、全必須providerが complete で error があれば FAIL/1、それ以外は PASS/0 です。必須providerが未定義のセットは INCOMPLETE/2 とし、warning は通知のみです。
診断自身はファイルを書き換えず、ネットワーク取得もしません。ただし ESLint の設定・プラグインなどは実行コードであり、隔離や副作用防止を保証しません。信頼済みプロジェクトでのみ使います。
期待値は各仕様の状態表、独立した fixture の型契約、ESLint のルール定義から導きます。実装出力のコピーを期待値にはしません。
実装担当者は仕様ロック前に、隔離 scratch でローカル解決と両ツールの別プロセス実行を確認します。設定不備、未対応版、タイムアウト、出力制限、配布後の実行も確認します。失敗した仮定は設計を修正して再確認します。
実装時は各要件に有効入力・境界・エラーの回帰テストを先行させ、期待した assertion の Red を確認します。修正後は異なる失敗機構ごとに隔離 mutation を実行し、復元後に再検証します。
速度・AI コストの削減率は未測定です。既存手順との比較は将来の評価項目であり、初期版の達成済み効果とは扱いません。

## TypeScript セットの全64組の判定表
各providerの状態を、完了C／未完了I、error有無0/E、warning有無0/Wの8通りで表します。C00は完了・errorなし・warningなし、IEWは未完了・両方ありです。info/hintは判定に影響しません。
行がTypeScript、列がESLintです。P/F/IはそれぞれPASS/0、FAIL/1、INCOMPLETE/2を示します。provider欠落と未定義の空セットは、表とは別にINCOMPLETE/2です。

```text
TS/ESLint C00 C0W CE0 CEW I00 I0W IE0 IEW
C00       P   P   F   F   I   I   I   I
C0W       P   P   F   F   I   I   I   I
CE0       F   F   F   F   I   I   I   I
CEW       F   F   F   F   I   I   I   I
I00       I   I   I   I   I   I   I   I
I0W       I   I   I   I   I   I   I   I
IE0       I   I   I   I   I   I   I   I
IEW       I   I   I   I   I   I   I   I
```

## 仮定の確定と後続対応
初期版の配置は、ルートの `node_modules/typescript` と `node_modules/eslint` を使用します。symlinkは許可しますが、祖先・グローバル・`NODE_PATH` への探索はしません。workspaceのhoistのみ、Yarn PnP、OS別の互換性は未保証であり、spikeで対応可否を記録します。
ESLint設定はルートの `eslint.config.js`・`eslint.config.mjs`・`eslint.config.cjs` のいずれか1つに限定する仮定です。複数・不存在・TypeScript形式のみ・親ディレクトリの設定だけの場合は未完了です。互換性の拡張は別途仕様変更とします。
Linux/Node24.21.0で実ツール・group停止・pack同梱のspikeと、17件のassertion Red→Greenを確認しました。初回実装検証のsignal理由の隠蔽を修正し、fixtureがeslint設定自身を選ぶ誤りも修正しました。修正fixtureでも隔離stubで17件のassertion Redを再確認し、実装復元後にGreenを記録しました。

## 実行した証拠と残る未確認事項
`node --test --test-reporter=spec .github/skills/lean-sdd-tdd/scripts/diagnostics.test.mjs` は最終17 pass、fail/skip0です。全64状態、8MiB丁度と+1byte、500ms注入timeout、通常の子孫停止、実TypeScript5.9.3/ESLint9.39.5、source/wrapper/pack/initコピーの0/1/2を確認しました。本番既定60000msの実時間停止は下記で確認しましたが、厳密等値の競合、Node20/22、macOS/Windowsは未確認です。通信の独立監視、任意detach子孫の隔離、性能・コスト削減率は保証しません。
隔離harnessとログはsession `f19a6ec9-6db2-429b-a409-154bd92f91ad/files/diagnostics-mutations.mjs`・`diagnostics-mutations-results.json`・`diagnostics-mutation-<name>.log` に保存しました。`node <session>/files/diagnostics-mutations.mjs` の最終結果は31/31 DETECTED、finally復元後の全体再実行は17 passです。これは31変異の検出であり、全故障・全環境の証明ではありません。
初回21変異では15検出・5生存・1無効があり、空profile・子孫停止・未対応版の実行前拒否・fixableルールの回帰を強化しました。無効なprotocol変異と無効力なpack変異も、成功扱いへの改変と実同梱欠落へ修正しました。5TESTは当該変異下のassertion Redを記録し、復元後Greenを再記録しました。追加前の27件はarguments/empty-profile/incomplete-verdict/warning-verdict/unknown-counts/stderr-budget/premature-timeout/protocol/descendant/snapshot/target-closure/force-checkjs/emit/positions/ts-version/local-scope/ts-config/eslint-version/ignored/all-ignored/fix/cache/lint-severity/lint-abort/pack-helper/workflow/documentationです。
既存共有CLIの `TEST-NODE-SUMMARY-001`・`TEST-R36C-CLOSURE-001`・`TEST-R36C-CLOSURE-002` は `sdd.mjs tdd refactor` で再実行成功しました。独立実装レビューの記録は `.sdd/review-diagnostics-<feature>.md`（contract/typescript/eslint/workflow）です。ランタイム・providerは修正後のクリーンな2回の確認、文書・配布は限定統合レビューで未解決指摘0です。修正後の変更対象gateは下記のとおり成功しました。開発検証は凍結manifestの連続2回リリース適格性検証ではなく、公開・tag・mergeを承認しません。
独立CLIレビューで大容量stdoutをflush前にexitする不具合と、連続超過出力・正常終了後の残留子孫の回帰不足が見つかりました。調査で未完了時の診断整列漏れも確認しました。3000件JSONと逆順の完全診断でassertion Redを確認してから修正し、CLI002/004のGreenを再記録しました。追加4変異stdout-flush/partial-order/output-stop/orphan-groupを検出しました。partial-orderの初案はin-place sortのaliasにより実効性がなくRedにならず、未完了時だけsortを省く変異へ修正して本物のRedを記録しました。
診断4moduleと共有CLIの構文チェック、既存source-discovery/spec-contextの8TESTは成功しました。README-jaのGiNZA proseは91→99、列挙文の分割で警告2件を解消しました。残るコード引数を主語とする反復1件はCLI説明に必要なため維持しました。レビューの初回provider担当が省略したテスト・配布・文書は別の限定レビューで補完し、指摘はありませんでした。
初回 `sdd.mjs gate --changed` はlock/trace/ledger/変更対象86TESTの証跡を通過しましたが、設定済み `npm test` は2749.3秒で失敗しました。要約が子テストの期待済み失敗に埋もれたため、全ログ保存の独立 `npm test` を実行し、3147.0秒・1102件・1097 pass/1 fail/4既存TODO/skip0を確認しました。既存TODOは成功証拠として数えません。ログは `diagnostics-gate-changed.log` と `diagnostics-full-test.log` に保持しています。
単一失敗は `sdd.test.mjs` の `r35b #364 TypeScript is exactly locked` でした。lock全体をroot+TSの2entryに限定した旧期待値が、承認済みのESLint/parser開発用依存を拒否しました。実行時・optional・bundled依存0とTS5.9.3固定を残し、rootのdev依存一致と全非root lock entryのdev=trueへ修正しました。`node --test --test-name-pattern='r35b #364' .github/skills/lean-sdd-tdd/scripts/sdd.test.mjs` は5 pass/skip0、`node <session>/files/diagnostics-lock-mutations.mjs` はruntime-dependency/transitive-runtime/root-lock-driftの3/3検出と復元前後の正常control成功です。Sonnet5.5の限定差分レビューは不変条件維持を確認しました。これは失敗原因を特定した修正であり、原因不明の再実行成功を採用するものではありません。
独立npm実行中に `node <session>/files/diagnostics-real-timeout.mjs` も実行し、Linux/Node24.21.0で既定60000msのtimeoutを60004.764408msで観測しました。正常workerはcomplete、停止したworkerは理由付きincompleteでした。任意のOS負荷や厳密60000ms等値の競合まで保証する計測ではありません。
修正後の `node .github/skills/lean-sdd-tdd/scripts/sdd.mjs gate --changed` は終了0、`SDD GATE PASS` です。ログは同じsessionの `files/diagnostics-gate-restored.log` に保存しました。診断4仕様のlock、56REQのtrace（error0）、303entryのledger、変更対象99/99TESTの証跡が通過し、設定済みの全 `npm test` も3461.3秒で終了0でした。テスト選択は既存3suiteを維持して診断suiteを追加しており、狭めていません。成功時のnpm生ログと件数要約はgateが保持しないため、この回の正確なpass/TODO件数は記載しません。
既存のtrace警告2件、stub文字列検出2file、既存証跡のweak Red1・characterization78・retest1件の警告は残っています。今回の診断17TESTのassertion Redとは区別します。`package.json` 変更に伴う実行定義のscope警告も残し、full gateの証跡範囲を検証したとは扱いません。レビュー記録内のgate未実行という記述はレビュー時点の状態です。この末尾の検証記録追記はコード・要件・設定・テストを変更しません。
