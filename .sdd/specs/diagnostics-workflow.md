---
feature: diagnostics-workflow
tier: T2
approval: auto
---
# Diagnostics: 開発手順と配布への組み込み
Goal: 利用者とエージェントが同じ診断契約を使い、既存の検証を弱めずに修正する。Updated: 2026-10-19。全行必須。
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DIAGFLOW-001 | When diagnostics is called through the source SDD CLI, npm wrapper or an initialized copy of lean-sdd-tdd, the system shall preserve the same version-1 result and exit status for the same project, and the packed package shall include all diagnostic modules without requiring musubix6 runtime dependencies. | TEST-DIAGFLOW-001, TEST-DIAGFLOW-005 |
| REQ-DIAGFLOW-002 (test-only) | When lean-sdd-tdd guides edits in any supported diagnostic profile, its instructions shall require explicit profile-appropriate diagnostics after a coherent edit batch and before completion, disclose incomplete reasons and bound requested-scope repairs to three attempts; JS/Python/Rust shall not acquire TypeScript prerequisites and unsupported stacks shall not acquire any supported profile's tools. | TEST-DIAGFLOW-002, TEST-DIAGFLOW-005 |
| REQ-DIAGFLOW-003 | When diagnostics finds errors or is clean, the workflow shall preserve existing targeted tests, expected-assertion Red requirements, approvals and final full gate, without adding diagnostics to gate automatically or recording it as TDD/approval evidence. | TEST-DIAGFLOW-003 |
| REQ-DIAGFLOW-004 (test-only) | When bilingual documentation describes diagnostics, it shall state each supported profile's versions, tool resolution, root/target/ignore scope, CLI/JSON/0/1/2 examples, trusted-config execution, no automatic fix/install, mypy's unknown non-ASCII columns, Rust temporary-output/Cargo-cache exceptions and cleanup, the 180-second limit versus 60 seconds otherwise, snapshot/recovery and unverified cases; it shall not claim publication or measured speed/cost savings without evidence. | TEST-DIAGFLOW-004, TEST-DIAGFLOW-005 |
## PASS conditions and counterexamples
| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-DIAGFLOW-001` | 全4profileをsource/wrapper/pack/initコピーから実行し0/1/2と時刻以外の共通結果を照合、Python bridge含め全helperを同梱 | JSだけTSを要求、コピー先のPython helper欠落、scratch削除前にwrapperがexit | TEST-DIAGFLOW-001, TEST-DIAGFLOW-005 | v1 Refactorとv2 assertion Red→Green。追加3profile×4経路×0/1/2の36実行を照合、Python bridge含む同梱を確認 |
| `REQ-DIAGFLOW-002` | 手順で4profileの適用条件・編集後実行・未完了通知・3回上限・範囲外修正禁止を確認(test-only) | PythonにTS必須化、Rustへ常に60秒、未導入を黙って無視する文言を拒否 | TEST-DIAGFLOW-002, TEST-DIAGFLOW-005 | SKILLの明示profileコマンドと既存手順のRefactor成功。未対応stackへツール導入を強制しない |
| `REQ-DIAGFLOW-003` | テスト/gate実行契約と履歴を維持し、診断だけではRed/承認不成立。CIのupdate-environment設定は許可し、deployment environment・secrets・OIDC・write権限・publish・特権triggerは拒否 | cleanでfull gate省略、compiler errorをassertion Redと扱う、setup-pythonのupdate-environmentをdeployment environmentと誤認 | TEST-DIAGFLOW-003、既存r35b CI testをname-patternで実行 | assertion Red→Green、履歴差分0、未初期化gateは拒否。全npmの唯一の失敗はenvironmentの部分文字列誤認で、既存CI test単独でもassertion失敗を再現。修正・変異後の結果はplanに追記する |
| `REQ-DIAGFLOW-004` | 両READMEで4profileの0/1/2と対応版/設定/制限/生成物/信頼境界/未検証を照合(test-only) | Python/Rustを将来対応のままにする、Rustの出力を完全read-onlyと主張、公開済み扱い | TEST-DIAGFLOW-004, TEST-DIAGFLOW-005 | v2版/コマンドと既存契約のRefactor成功。日本語fullのGiNZA reading-loadは99→100、finding0。構造診断の既存13flagは維持 |
Risk stages: contract=手順で意味が変化; inputs=配布先/対象stack; execution=wrapper/copy/pack; verdict=exit握り潰し; history=既存Red/承認不変; integration=3経路と両言語。
## Design
CLIから相対importできる診断モジュールをlean-sdd-tdd/scripts配下に置く。npm wrapperは既存委譲、initは既存コピーを再利用する。provider依存は対象project側から解決する。経路比較は同じrealpath rootを使い、path表現は共通契約に正規化、時刻と理由の詳細文字列は比較対象外。
手順・参考文書・両READMEを同時更新し、既存gate本体へ新しい必須チェックを注入しない。文書行の受入はtest-only、実行経路は隔離pack fixtureで確認する。
## Assumptions / risks
Oracle: diagnostics-contract と既存gate/Redのcharacterization。v2のscripts追加（Python bridgeを含む）がfiles/initへ漏れなく入ることはpack/copy spikeで確かめる。エージェント遵守率・性能改善は保証外。ユーザーの2026-10-19の「次の実装を開始」により3言語の要件を追加。初期17TESTの成功をv2の追加分へ流用しない。
v2 evidence: `sdd.mjs tdd green TEST-DIAGFLOW-005` と `tdd refactor --stale` が成功。Node20/22・macOS/Windows・remote CI・最終gateは未確認。開発用pinは `scripts/diagnostics-tools.txt`、CI/publishのtest jobで私有venvとRust1.99.0を用意し、missing prerequisitesをskipしない。公開処理は実行していない。
Evidence (2026-10-19): dry-runと実pack/extract/initで診断4fileと実行を確認。上記4TESTを含む17件assertion Red→Green、skip0。隔離3変異検出（履歴不変は共通snapshot変異でも検証）。コマンド・未確認環境はdiagnostics-contract末尾、全体gate・レビュー結果はplanに追記する。
Compatibility: 全npm再実行は1102件中1097 pass/1 fail/4既存TODO/skip0。旧 `r35b #364 TypeScript is exactly locked` の2entry固定が追加dev依存を拒否したため、TS固定版・実行時依存0を維持しroot dev依存の一致と全lock entryのdev=trueを確認する形へ修正。関連5TEST成功、runtime追加/transitive dev=false/rootlock不一致の隔離3変異を検出、前後の正常controlも成功。Sonnet5.5差分レビューで不変条件の維持を確認。
CI compatibility: 追加後の全npmは1119件中1114 pass/1 fail/4既存TODO/skip0、診断34件は成功した。唯一の失敗は既存 `r35b #364 CI qualifies Node 20/22/24 without publication and retains failure evidence` である。`environment:` の部分文字列検索が、Python3.12のPATHを維持する `update-environment: false` も拒否した。既存の公開禁止方針は変えず、単語/hyphen接頭辞のないdeployment keyだけを識別する。実際の禁止6分類をCI文字列へ個別に注入し、既存testがassertionで拒否することと、復元後の正常controlを確認する。全体gateやremote CIの成功は未確認である。
