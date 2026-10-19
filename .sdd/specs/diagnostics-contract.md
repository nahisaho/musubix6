---
feature: diagnostics-contract
tier: T2
approval: auto
---
# Diagnostics: CLI と結果の契約
Goal: 利用者とエージェントが診断結果と未完了を区別する。Non-goals: gate・Red の変更、常駐、キャッシュ。Updated: 2026-10-19。全行は初期版必須。
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DIAGCLI-001 | When `diagnostics [--root DIR] [--json]` is invoked, the system shall diagnose the realpath project (default cwd); empty/missing/nonexistent/non-directory DIR or unknown/positional/repeated arguments shall return INCOMPLETE/2 without launching providers; `--help` alone shall print usage and exit 0, while help combined with other arguments is invalid. | TEST-DIAGCLI-001 |
| REQ-DIAGCLI-002 | When results are reported, including input errors, the system shall emit the version-1 result defined in Design as exactly one JSON object on stdout if `--json` is present (except sole help), or a human-readable equivalent otherwise; incomplete results shall have a nonempty reason and retain only fully parsed valid diagnostics. | TEST-DIAGCLI-002 |
| REQ-DIAGCLI-003 | When a language profile is aggregated, the system shall require its declared providers and return INCOMPLETE/2 if any is missing/incomplete or none are declared, otherwise FAIL/1 if any error exists, otherwise PASS/0; warnings alone shall not fail; v1 implements only the default typescript profile requiring TypeScript and ESLint, not Python/Rust diagnosis. | TEST-DIAGCLI-003 |
| REQ-DIAGCLI-004 | When providers run, the system shall use project-root cwd, execute TypeScript then ESLint sequentially without a shell, attempt both despite failure, and mark spawn errors, signals, malformed output, more than 60000 ms from spawn through close (including config/analysis), or combined raw stdout/stderr over 8388608 bytes per provider incomplete; on limits it shall terminate/reap the owned worker and descendants before proceeding, reporting cleanup failure. | TEST-DIAGCLI-004 |
| REQ-DIAGCLI-005 | When diagnosis runs, the system shall perform no automatic install, network fetch, fix, emit, cache or history write, and shall identify the result as a diagnostic snapshot, not TDD/approval/gate evidence; trust in executable project configuration is required, not sandboxed. | TEST-DIAGCLI-005 |
## PASS conditions and counterexamples
| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-DIAGCLI-001` | cwd/有効rootを受理、空引数・重複・`--changed`・help混在は子実行0回で2 | 存在しないrootのcwd置換やhelp混在の成功を拒否 | TEST-DIAGCLI-001 | assertion Red→Green、arguments変異検出 |
| `REQ-DIAGCLI-002` | clean/control・fileなし設定エラー・不正root・3000件診断でもJSONを1回parse可能、incompleteに理由とnull countsあり | pipe出力の早期exit切断、ログ混入・欠落field・切れた出力からの診断復元、未計測countsの0埋めを拒否 | TEST-DIAGCLI-002 | assertion Red→Green、3000件JSONの完了待ちを確認、unknown-counts/stdout-flush検出 |
| `REQ-DIAGCLI-003` | `.sdd/plan.md` のprovider別完了/error/warningの全64組と、必須欠落・空セットを照合 | error+incompleteをFAIL/1、空セットをPASS/0、Python/Rust対応済みとする変異を拒否 | TEST-DIAGCLI-003 | assertion Red→Green、64/64一致、empty-profile/incomplete-verdict/warning-verdict検出 |
| `REQ-DIAGCLI-004` | 成功control、起動失敗・signal・60000ms超・8388609bytes・不正JSONは未完了、8388608bytes以内を許可、終了後子孫と連続超過も停止、失敗後の完全診断は整列保持 | stderr超過・連続出力の停止省略、残留子孫、未完了の診断順序の欠落を拒否 | TEST-DIAGCLI-004 | assertion Red→Green、8MiB/8MiB+1実測、500ms timeout・残留子孫停止、stderr-budget/premature-timeout/protocol/descendant/partial-order/output-stop/orphan-group検出 |
| `REQ-DIAGCLI-005` | 両方実行前後のfixture差分0、外部取得0、snapshot注記あり | 自動導入や tdd.jsonl 追記を拒否。信頼済みpluginの任意副作用は保証外 | TEST-DIAGCLI-005 | assertion Red→Green、fixture差分0、snapshot変異検出。外部通信の独立監視は未実施 |
Risk stages: contract=状態表の穴; inputs=不正root; execution=起動・時間・容量; verdict=未完了の成功化; history=履歴保存なし・既存証跡不変; integration=wrapper/コピー経路は diagnostics-workflow。
## Design
独立モジュールを既存 CLI から呼び、profile→必須provider→共通集約とする。初期profileはtypescript、必須provider順はtypescript/eslint。Python/Rustのセット内容・選択方式は後続仕様。provider状態はpending→running→complete/incomplete、逐次実行。全体状態表は `.sdd/plan.md`。永続状態・再試行なし。
JSON必須: `schemaVersion:1, profile:string, root:string|null, reason:string|null, startedAt:ISO8601, completedAt:ISO8601, status:PASS|FAIL|INCOMPLETE, exitCode:0|1|2, snapshot:true, providers:[{source:string,status:complete|incomplete,version:string|null,configPath:string|null,reason:string|null,files:{included:integer|null,checked:integer|null,ignored:integer|null},diagnostics:[{source:string,file:string|null,line:integer|null,column:integer|null,code:string,severity:error|warning|info|hint,message:string}]}]`。入力不正はroot=null/providers=[]/reason必須、時刻は呼出開始/終了。正常rootはrealpath絶対パス。provider incompleteもreason必須、completeはreason=null。fileなしは位置null、位置は1始まりUTF-16。fileをrealpath化して内外を判定、内側は相対パス・外側は絶対パス（いずれも `/` 区切り）。provider順→file/line/column/code/message（文字列はUTF-16 code-unit順、null先頭）で整列。info/hintは判定中立。filesはprovider別定義であり横断集計しない。
全体incompleteもreason必須、他はreason=null。configPathは絶対パスか未解決時null、messageはANSI色なし。provider completeのcountsは非負整数、incompleteは3つともnull（件数を確定しない）。既知の位置は正整数。fileのrealpath取得失敗はprovider incompleteとし、未解決pathを確定位置として報告しない。
## Assumptions / risks
Oracle: ユーザー合意と上記状態表。仮定: Node>=20/Linux・macOS・Windowsの別プロセス制御が可能（各OS spikeで確認、未確認は非合格）。timeout後の停止・回収もspike対象。実行中の編集検出・環境隔離・JSONの認証は対象外。境界の期待値は独立fixtureから導く。
Evidence (2026-10-19): Linux/Node24.21.0でspike・17件assertion Red→Green、`node --test --test-reporter=spec .github/skills/lean-sdd-tdd/scripts/diagnostics.test.mjs` は17 pass/skip0。隔離harness `diagnostics-mutations.mjs` は31/31検出・復元後17 pass（詳細と経緯はplan）。`diagnostics-real-timeout.mjs` は本番60000msで60004.8ms後に未完了、成功controlも確認。厳密等値の競合・macOS/Windows・Node20/22は未確認。group外へ自らdetachするplugin子孫は保証外。
