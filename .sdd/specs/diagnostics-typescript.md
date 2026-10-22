---
feature: diagnostics-typescript
tier: T2
approval: auto
---
# Diagnostics: TypeScript の診断
Goal: 型・構文・参照の問題を、既存設定を変えずに早期取得する。読者は利用者と実装担当者。Updated: 2026-10-19。全行は初期版必須。
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DIAGTS-001 | When TypeScript diagnosis starts, the system shall load TypeScript 5.9.x from root/node_modules/typescript (symlinks allowed) and root `tsconfig.json`; missing tools/config, unsupported versions, invalid config or effective nonempty project references shall produce incomplete with a reason, never ancestor/global/NODE_PATH fallback or install. | TEST-DIAGTS-001 |
| REQ-DIAGTS-002 | When supported config loads, the system shall analyze all files selected by its effective config and their compiler dependencies, respecting extends/include/exclude/allowJs/checkJs, report option/global/syntactic/semantic diagnostics, and emit no JavaScript, declaration, source map or tsbuildinfo. | TEST-DIAGTS-002 |
| REQ-DIAGTS-003 | When TypeScript diagnostics are normalized, the system shall preserve diagnostic code and flattened message, map Error/Warning/Message/Suggestion to error/warning/info/hint, and translate file offsets to the common 1-based UTF-16 positions, including fileless diagnostics. | TEST-DIAGTS-003 |
| REQ-DIAGTS-004 | If no input files are selected or provider execution cannot complete, the system shall return incomplete with the cause and available diagnostics; otherwise it shall report complete with explicit included/checked counts, ignored=0 and the resolved version/config path, even when type errors exist. | TEST-DIAGTS-004 |
## PASS conditions and counterexamples
| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-DIAGTS-001` | local5.9 controlを受理、missing/config不正/5.8/6.x/referencesを未完了 | global5.9だけ存在するrootを成功扱いする変異を拒否 | TEST-DIAGTS-001 | assertion Red→Green、ts-version/local-scope変異検出 |
| `REQ-DIAGTS-002` | `const n: number = "x"` と未編集consumerの型不一致を検出、正しいnumber controlを受理、emit差分0 | 変更fileだけ検査、extends無視、checkJs強制、incremental書込みを拒否 | TEST-DIAGTS-002 | assertion Red→Green、target-closure/force-checkjs/emit変異検出、fixture差分0 |
| `REQ-DIAGTS-003` | 4種全列挙・fileless・改行・絵文字の後の位置を独立文字列offsetと照合 | UTF-8 byte位置や0始まりを返す変異を拒否 | TEST-DIAGTS-003 | assertion Red→Green、4分類・UTF-16一致、positions変異検出 |
| `REQ-DIAGTS-004` | 正常sourceあり=complete、型errorありもcomplete、files=[]/起動失敗=理由付きincomplete | 空programをclean成功、type errorを実行未完了扱いする変異を拒否 | TEST-DIAGTS-004 | assertion Red→Green、ts-config変異検出、空入力と型errorの対照成功 |
Risk stages: contract=検査対象の誤認; inputs=tsconfig/版/references; execution=emit/起動; verdict=診断errorと未完了の混同; history=保存なし・既存証跡不変; integration=配布は diagnostics-workflow。
## Design
diagnostics-contract の子providerでローカル TypeScript APIを使い、configを解析してProgramを作る。emitは呼ばない。設定失敗はincomplete、解析完了後のcompiler診断はcompleteの結果として返す。
includedはtsconfigから選んだroot file数、checkedはProgram内source file数（標準lib・依存含む）。ESLintのcheckedとは意味を区別して表示。既定設定を勝手に補正しない。
## Assumptions / risks
Oracle: fixtureで宣言した型・TS5.9公開API。仮定: APIでnoEmit・extends・incrementalを副作用なしに扱える（設定組合せspike）。JavaScriptはallowJs/checkJsに従う。ESLintと共有する対象選択は、このfeatureが所有する。pnpm/workspace配置の互換性はspikeで確定、未確認は未対応と明示。
Evidence (2026-10-19): Linux/Node24.21.0、実TypeScript5.9.3でincremental/declaration設定のProgram解析、2322検出、emit差分0を確認。上記4TESTはassertion Red→Green、隔離7変異を検出。共通の実行コマンド・未確認環境はdiagnostics-contract末尾、経緯はplan。
