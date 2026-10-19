# Diagnostics: 要件定義と実装順序
対象読者は musubix6 の利用者・開発エージェント・実装担当者です。編集後の診断契約と、実装前に確かめる条件を共有します。
更新日: 2026-10-19。v1はcommit `58b0f8f` で変更対象gate（全npmテストを含む）まで成功しました。v2のJavaScript単独・Python・Rustは実装と34件の診断回帰を終え、独立実装レビューの指摘を検証中です。全機能T2で、共通実行方針のRust例外とRust仕様はhuman承認、他はauto承認です。最新specの再承認・最終gate・公開承認は未実施です。

| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | diagnostics-contract | - | CLI・共通結果・実行制御 |
| 2 | diagnostics-typescript | diagnostics-contract | TypeScript 5.9 系・単一 tsconfig |
| 3 | diagnostics-eslint | diagnostics-contract,diagnostics-typescript | ESLint 9 系・flat config。順序2のtsconfig対象選択を再利用 |
| 4 | diagnostics-javascript | diagnostics-contract,diagnostics-eslint | v2: ESLintのみ、TS入力選択から分離 |
| 5 | diagnostics-python | diagnostics-contract | v2: .venvのRuff/mypyと薄いnative bridge |
| 6 | diagnostics-rust | diagnostics-contract | v2: offline/locked cargo、一時生成物は人間承認 |
| 7 | diagnostics-workflow | diagnostics-contract,diagnostics-typescript,diagnostics-eslint,diagnostics-javascript,diagnostics-python,diagnostics-rust | 全profileの手順・ラッパー・コピー・npm 同梱 |
順序表は診断7機能を扱います。他の既存仕様も検証から外しません。新仕様のmissing lock/test警告は未実装を表し、PASSではありません。human対象はspike・独立レビュー後に正確な全path/hash/残余リスクを示して承認を求めます。

## v1の合意した対象と対象外（以下は実装済みの記録）
主な利用言語は TypeScript・JavaScript・Python・Rust です。共通契約は言語別の診断セットを扱い、初期版は TypeScript セットのみとします。
v2ではPython・Rustに加え、tsconfigのないJavaScript単独プロジェクトを明示profileで追加します。以下のv1実績は歴史的証拠であり、v2追加分の合格証拠ではありません。
TypeScript セットは TypeScript と ESLint の両方を必須とします。この条件を将来の JavaScript・Python・Rust セットへ流用せず、それぞれの必須ツールは後続仕様で決めます。初期版に言語自動判定やセット選択オプションはありません。
`musubix6 sdd diagnostics [--root DIR] [--json]` で指定した1プロジェクト全体を診断します。常駐せず、エージェントが編集後に実行します。
既存の TypeScript・ESLint と設定を使います。JavaScript の型検査は tsconfig の `allowJs`・`checkJs` に従い、強制的に有効化しません。
LSP・IDE 接続、変更限定、モノレポ自動横断、project references は対象外です。依存の自動導入、自動修正、キャッシュ、診断履歴の保存も行いません。
初期版は、プロジェクトルートの `tsconfig.json` に含まれるファイルを対象とします。tsconfig 外のファイルまで検査したとは表示しません。
結果は実行時点の診断であり、後から変更されたファイルの状態や動作の正しさは保証しません。診断を TDD の Red・承認証跡・最終 gate の代わりにしません。

## v1の設計・受け入れ方針
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

## v2: 10回答で確定した追加範囲
JavaScriptはESLint9のみでTS不要、Pythonはroot .venvのPython3.14.x/Ruff0.17.1/mypy2.4.0の両tool、Rustは既存cargo/rustc1.99.xのcargo checkのみです。対応外の版・欠落を自動導入せず未完了にします。Pythonのroot標準設定と各除外に従い、設定がなければ既定値でproject全体を検査します。Rustは単一packageの全target・既定featuresであり、複数package workspace/全feature列挙は対象外です。
CLIは `--profile typescript|javascript|python|rust`、省略時typescriptで自動判定しません。順序と時間予算の期待値は次の独立表です（単位ms）。各providerのnative累積stdout+stderrとworker protocolには8MiB上限を適用します。
```text
profile     required providers       timeout
typescript  typescript eslint        60000 60000
javascript  eslint                   60000
python      ruff mypy                60000 60000
rust        cargo-check              180000
```
全144状態は、上記8状態C00/C0W/CE0/CEW/I00/I0W/IE0/IEWについてTS/Python各8x8をv1表と照合し、JS/Rust各8状態は `P P F F I I I I` と照合します。必須providerの欠落・重複・余剰・空集合もprofile別に拒否し、valid controlも通します。
10回答では、Rustはoffline/locked・既存lock必須とし、privateな外部一時生成物だけを許可して親が削除する方針としました。spikeで判明した永続Cargo cache書込みの追加例外を、次節で提案します。一時出力・180秒化も含め、common/Rust仕様の最終path/hash承認前に本実装へ進みません。
spike/development fixture用のtool導入は明示的な私有環境に限り、利用者projectに対する診断の自動導入とは区別します。新toolの検証用pin manifestはsession内に置き、runtime依存は増やしません。実施したことと未実施を各specへ記録し、独立レビューと承認後に回帰Redを先行させます。

## v2の隔離spikeで判明した条件
session `f19a6ec9-6db2-429b-a409-154bd92f91ad/files/diagnostics-v2-spike.mjs` をLinux/Node24.21.0/Python3.14.4/cargo1.99.0で実行しました。固定版toolの導入は同sessionの私有venvだけです。結果JSONは `diagnostics-v2-spike-results.json`、実行コマンド53件と追加観測11件を記録しています。これは設計仮定の確認であり、未実装providerのRed/Greenではありません。
PythonはRuff JSON/mypy JSONL、正常0・違反1・mypy構文中断2、root設定優先順位・親設定抑止、2 sourceのnative選択とsource/venv hash差分0を確認しました。mypyはdirectory symlinkを辿るため、nativeで読んだ除外に必須除外をmergeしてから同じ集合を検査します。ASCIIの列は一致しましたが、é/あ/絵文字/結合文字/絵文字2個ではnative列が独立位置とずれました。推測補正はせず、非ASCII行のcolumn=nullとinfo通知を仕様に明記しました。Ruffはcodepoint列からUTF-16へ変換します。
JavaScriptはTypeScript/tsconfigなしで実ESLint9.39.5がJSXを解析し、no-debugger診断を返しました。Rustはlib/bin/test/exampleの4 root、private target-dirとbuild.build-dir、projectのhash差分0を確認しました。型不一致、build script panic、依存不足はいずれもexit101ですが、JSONのcompiler error/build-finishedの有無で区別できます。未導入toolchainは自動導入せず拒否されました。
**追加の人間承認事項**: Cargo homeでは .global-cache/.package-cache/.package-cache-mutate が作成・更新されます。offlineでも、既存archiveの依存はregistry/srcへ展開されます。これらの永続Cargo依存cache書込みも許容する案とし、自動cache削除は無効にします。Cargo homeはproject外に限定します。一時build出力・180秒とあわせてcommon/Rust仕様のpath/hash承認を得るまで実装しません。親の停止後cleanup・native予算・全144判定・pack/copyのv2回帰・他OS/runtimeは未実行です。
追加確認では、mypyのconfig files上書き・直接除外されたimport先の診断・duplicate module中断、Ruffのnested設定抑止・Notebook除外・改行pathの曖昧性、Pythonのencoding/newlineを確認しました。Cargoではroot版probe・build.rs自身のcompile error・依存packageのcompile error・Cargo homeの絶対/相対/symlink/default/内部境界を確かめました。mypyの既知の列0は1へ変換し、負の位置はnullにします。Rustの構文診断ではnative code=nullを確認したため、共通codeをrustcと明示しました。途中のspikeでRuff用反例が型不一致だけになっていたfixtureを修正し、全件を再実行しました。この失敗はfeatureのRed証跡には採用していません。mypy modules/packagesの個別指定、section適用判定とnotice生成、未実装の各provider回帰は未実行で、実装時の必須検証として残します。

## v2実装の検証記録（2026-10-19）
上記の未実行表記はspike時点の記録です。旧common/Rust hashへの実際のhuman承認を記録してから、追加17TESTのassertion Redを先行させました。最初の累積native runnerは空結果を返すfailing stubです。mypyでは設定filesと `-c ""` の衝突、duplicate moduleのnull code、別interpreter指定を確認して修正しました。Cargoではcompiler errorとruntime abortの混在、child note/helpの欠落を修正しました。共通runnerの遅延closeも確認しています。native/spikeの終了失敗はfeatureのassertion Redへ置き換えていません。
fixtureの共有preambleを拡張すると既存Redとtest hashが一致せず、Greenが正しく拒否されました。元のRedを残したまま、拡張後の17TESTを隔離した反例変異で再びassertion Redにしました。sourceを復元後、`sdd.mjs tdd green TEST-DIAGCLI-006 … TEST-DIAGFLOW-005` を実行し、全17件が成功しました。`tdd refactor --stale` で影響したv1の12件も成功しました。ログはsessionの `diagnostics-v2-red-refresh-*`・`diagnostics-v2-tdd-green.log`・`diagnostics-v2-refactor-stale.log` です。
`node <session>/files/diagnostics-v2-mutations.mjs` の初期実装の固定集合（revision 1）は51/51検出、毎回finallyでsourceを復元しました。初回49件中1件は生存しました。mypy2.4.0自身がCLI `--exclude` を設定の除外へ追記するため、adapterの重複mergeを除いても意味が変わらない変異でした。重複処理を削除し、root configを使わない本物の反例へ置換しました。初回結果も `diagnostics-v2-mutations-initial-results.json` に残しています。revision 1には遅延close・native stderr・byte丁度/+1・version/provenance・ignore/UTF位置・cache・Cargo policy/outcome/coverage・親cleanupが含まれ、無効変異やsetup失敗は検出数に数えていません。全故障・全環境の証明ではありません。
`node <session>/files/diagnostics-v2-rust-real-timeout.mjs` は180097.2msでINCOMPLETE、通常のbuild-script PIDと専用一時出力は不存在でした。`diagnostics-v2-python-real-timeout.mjs` は実mypy metadata/config読取のwriterなしFIFOを60013.7msで停止し、FIFOを除いた正常対照もcompleteでした。各実行前後で対象実装hashの一致を確認し、結果JSONに保存しました。厳密な等値競合や全OS負荷の保証ではありません。
追加3profileのsource/wrapper/pack/init各経路で0/1/2を36回照合しました。以前のTS経路は既存TESTを維持しています。`scripts/diagnostics-tools.txt` はRuff0.17.1/mypy2.4.0の開発用pinで、CIとpublishのtest jobにのみ明示的な準備を追加しました。診断処理とテスト自体は自動installしません。npm実行時依存は増やしていません。
両README・SKILL・referenceを更新しました。README-jaのfull prose/reading-load/outline/termsを実行し、genitive_chain1件を修正してscore99→100/finding0です。構造診断の13flagは、既存のbacktick付きリンク誤検知・既存見出し・既存directory treeであり、今回の対象外として維持しました。独立実装レビュー、更新証拠を含むspecの再lock、最終gateはこの時点では未実施です。Node20/22・他OS・remote CI・release qualificationは未確認で、公開・merge・commitを承認しません。

## v2実装レビュー後の追検証（2026-10-19）
Claude Sonnet 5.5の独立レビューで、compiler-messageのないCargo成功report後の破損末尾を受理するS2を確認しました。同じ位置のguardは、破損前の複数診断を先頭だけに切り詰める原因にもなっていました。Pythonでは空の診断とnative exit1の組合せをcompleteにするS3を確認しました。両者を既存specのPASS条件・反例へ記録しました。nahisahoは共通hash `29585c92885d3cc83d6b7f24553d621e4385388fb2b0887a6048db4c7dc033bb` とRust hash `22403034ee9681e0aa55f1587f5a34ca21520e6330b35a7f14886358573411c8` を再承認しました。
`tdd red TEST-DIAGPY-003 TEST-DIAGPY-004 TEST-DIAGRUST-003` は、productionの修正前に3件とも期待するassertionで失敗しました。ログは `diagnostics-v2-review-red.log` です。Rustのparse-error判定をloop後へ移し、Pythonに空結果+exit1の拒否を加えました。空結果+exit0と破損のないCargo成功も受理し、拒否一辺倒ではないことを確認しました。
追加の隔離変異は、runtime版guard・mypy通知の重複排除・JSONLの有効prefix保持・Pythonの空結果判定・Cargoの不正末尾判定・全prefix保持の6件です。初回は通知変異が生存しました。2errorのfixtureを誤ってRuff側へ追加していたためで、mypy側を修正し、2errorとinfo1件を別々にassertしました。初回結果は `diagnostics-v2-review-mutations-initial-results.json` に保持しています。修正後は6/6がassertionで検出され、sourceも毎回復元されました。これは初期51件とは別の追検証集合であり、現行57件の一括実行やreleaseの固定matrixとは扱いません。
最後のtest変更後に17件の反例Redを再記録し、復元後の正式Greenも17件すべて成功しました。`diagnostics-v2-final-combined.log` は既存・追加の合計34 pass/fail0/skip0です。Pythonの候補0・全除外・共用設定sectionなし、未知file/行/列、壊れたUTF-8前の完全record、実2-package workspace拒否も含みます。実Python3.13は未導入のままです。version APIを置換した3.13/3.15/3.14 prereleaseの拒否と、3.14 finalの受理は実行しましたが、物理runtimeの代替証明とはしません。
symlink先を確認できない場合の未完了は、保守的な既存動作として維持し、Python spec・両README・SKILLへ制限を明記しました。README-jaの追加後のreading-load診断はscore100/findings0、共通/Rust specも100/findings0です。Python specのrisk-stage列挙は長文flag1件を維持しました。planの過去の証拠列挙にもflagがありますが、証拠の意味を変えないため維持します。追検証時の `tdd refactor --stale` は再検証対象0件で、既存sdd本体のCODE span外に関する警告は残っています。
修正後、両review軸が同一の凍結manifestで連続してclean1/clean2を報告しました。最初のclean確認は主にcodeとhash、2回目は省略されていたtest本文・実際のRed/Green・変異logも読みました。review入力はsessionの `diagnostics-v2-final-review.sha256`、feature別記録は `.sdd/review-diagnostics-*.md` です。未解決S1/S2/S3は0件です。
修正後の最終sourceでも実時間停止を再確認しました。Pythonは60012.7msでincomplete、FIFOを除いたcontrolはcompleteです。Rustは180094.1msでINCOMPLETE、scratchと通常のbuild-script PIDは不存在でした。両harnessは実行前後の実装hash一致を確認しています。旧結果は `diagnostics-v2-*-real-timeout-before-review-results.json` へ保存し、新旧の観測を区別しました。
この時点で最終gateは未実行です。Node20/22・他OS・remote CI・release qualificationは未確認で、commit・merge・公開は承認していません。

## v2最終gateの入力変化（2026-10-19）
`diagnostics-v2-final-gate.log` の最初の実行は終了1でした。lock・trace（69REQ/error0）・ledger（422entry）・変更対象30/30TESTのRed→Green確認は通過しましたが、全npm check後に `../../.npmrc` の内容変化を検出しました。これはuser-level設定 `/home/nahisaho/.npmrc` で、mtimeは22:22:57 JST、gateの終了は22:44:01 JSTでした。誰が変更したかは未確認です。個人設定の内容は読まず、変更・復元もしていません。
入力が実行中に変化したため、この回のgateは有効な成功証拠ではありません。checkの生出力・終了状態はintegrity拒否後の要約から確定できず、npm全件成功とも失敗とも判定しません。実装やテストの凍結manifestは再照合し、設定・テスト・gateを弱めず、現在の環境入力を新たな基準として全checkを再実行します。前回結果は別名で保持します。再実行は同一入力での連続成功やrelease qualificationとは扱いません。

## v2全体テストで検出したCI guardの誤認（2026-10-20）
環境入力を基準化した2回目のgateでは入力integrityを通過しましたが、`npm test` が3294.3秒で失敗しました。gate要約の先頭6件は、期待済み失敗を扱う成功testの名前などに埋もれ、実際の失敗名を表示しませんでした。失敗を推測せず、全npmの生logを別実行で保存しました。
`diagnostics-v2-full-test.log` は3322.6秒、1119件中1114 pass/1 fail/4既存TODO/skip0です。診断34件はすべて成功しました。唯一の失敗は既存の非公開CI test `r35b #364 CI qualifies Node 20/22/24 without publication and retains failure evidence` でした。禁止deployment keyの `environment:` を部分文字列で探したため、今回追加したsetup-pythonの `update-environment: false` まで拒否しました。後者は既存Python3.12のPATHを維持するための設定で、deployment環境でも公開許可でもありません。
既存test単独でも同じassertion失敗を再現し、`diagnostics-v2-ci-false-positive-before.log` に保存しました。testの既存matcherを単語・hyphen接頭辞のない `environment:` へ限定し、CIそのものや公開禁止方針は変えませんでした。これは誤った期待値の修正であり、新機能のproduction Redや新しいREQのRedとは主張しません。workflow specの既存PASS条件とCompatibilityに反例を追記しました。
CI文字列への隔離変異で、secrets・OIDC・write権限・publish・deployment environment・特権triggerの6分類をそれぞれassertionで拒否しました。CI jobは実行せず、変更したworkflowを読む既存testだけを起動しました。毎回workflowをfinallyで復元し、変異前後の正しいCIも受理しました。`diagnostics-v2-ci-policy-mutations-results.json` に6検出と2controlを記録しています。quote/aliasなど任意のYAML全形式の検査や、一般的なsecurity parserを新設したとは扱いません。
Sonnet5.5が同じ `diagnostics-v2-ci-review.sha256` に対して連続clean1/clean2を報告しました。2回目には4つのEARS行が変更前contextと一致すること、正常controlが各1 pass/fail0、deployment変異が負のassertionで失敗することも確認しました。診断実装の旧manifestは一致したままです。workflow specとreviewのauto-lockを更新し、最終gateを再実行します。先行した不合格は取り消さず、releaseの連続成功にも数えません。

## v2修正後の変更対象gate結果（2026-10-20）
修正後の `node .github/skills/lean-sdd-tdd/scripts/sdd.mjs gate --changed` は終了0、`SDD GATE PASS` でした。実行時に `MUSUBIX_DIAGNOSTICS_TEST_VENV` を固定版toolの私有venvへ指定しました。生のgate要約はsessionの `diagnostics-v2-final-gate.log`、先行する不合格は `diagnostics-v2-final-gate-input-drift.log` と `diagnostics-v2-final-gate-npm-failure.log` に残しています。
各lock、69REQのtrace（error0）、423entryのledger、変更対象109/109TESTの証跡が通過しました。設定済み全 `npm test` も3333.3秒で終了0です。成功したgateはnpmの件数要約を保存しないため、この回の正確なpass/TODO件数は推定しません。直前の1119件の失敗実行とも区別します。4つの既存suiteを維持して追加suiteを含めたまま検証しました。
既存trace警告2件、stub文字列の2file、過去のweak Red1・characterization78・retest1件は残っています。これらを追加17TESTのassertion Redとは混同しません。Rustの承認後実装差分に対する人間再確認警告も残っています。修正は独立レビュー済みですが、人間による実装再確認が済んだとは主張しません。
scopeはexact0/widened1/unknown0です。user-level `.npmrc` の既存Greenからの差分と、package.jsonがcheck定義を変えるという警告を維持しました。個人設定の内容は読まず、変更もしていません。成功回では実行中の入力変化は検出されませんでした。過去と同一の環境だったと証明したわけではなく、scope警告も未解消です。
診断・CI deltaの凍結manifestを再照合し、要件・実装・テスト・実行設定をgate後に変えていないことを確認します。この追記と生成するcost logは観測記録の更新です。Node20/22・他OS・remote CI・full evidence gate（変更対象外も含む）・固定matrixによる連続2回のrelease qualificationは未確認です。commit・merge・tag・npm公開は実行も承認もしていません。

## Rust実装の人間再確認とコミット承認（2026-10-20）
承認後のRust実装差分は `protocolError ??= parsed.error` をcompiler-message分岐から全recordの処理後へ移した1行だけです。この移動を逆に戻すと、承認時の実装hash `e7e45d7fdc681e9bbd87305c71a26bb0d1325e2b4c7be377cd59291f46cf440e` と一致しました。現行hashは `0e33a254c9dc32ec045588e5e629ba06f83a5c4d2f7351221aae29ad1f00210a` です。
この差分と、不正末尾を未完了にすること・有効prefixを保持することを説明した後、nahisahoから「承認。コミットします。」という回答を得ました。Rust specは同じhash `22403034ee9681e0aa55f1587f5a34ca21520e6330b35a7f14886358573411c8` のままprepare・recordを行い、保存された実装baselineと現行fileの一致を確認しました。成功gate時に残っていたRustの人間再確認は、この実際の承認記録で更新しました。
gate後に要件・診断実装・テスト・実行設定は変えていません。以後の変更は承認・観測記録と生成cost logだけです。今回の承認範囲はコミットまでであり、push・merge・tag・公開は含みません。未確認の環境・full evidence gate・release qualificationは引き続き残ります。
