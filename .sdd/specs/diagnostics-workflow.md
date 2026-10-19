---
feature: diagnostics-workflow
tier: T2
approval: auto
---
# Diagnostics: 開発手順と配布への組み込み
Goal: 利用者とエージェントが同じ診断契約を使い、既存の検証を弱めずに修正する。Updated: 2026-10-19。全行は初期版必須。
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DIAGFLOW-001 | When diagnostics is called through the source SDD CLI, npm wrapper or an initialized copy of lean-sdd-tdd, the system shall preserve the same version-1 result and exit status for the same project, and the packed package shall include all diagnostic modules without requiring musubix6 runtime dependencies. | TEST-DIAGFLOW-001 |
| REQ-DIAGFLOW-002 (test-only) | When lean-sdd-tdd guides an agent editing an in-scope TS/JS project, its instructions shall require diagnostics after a coherent code-edit batch and before claiming completion, surface incomplete reasons, and permit bounded repair only within the requested change scope; Python/Rust and other unsupported stacks shall not acquire the TypeScript prerequisites. | TEST-DIAGFLOW-002 |
| REQ-DIAGFLOW-003 | When diagnostics finds errors or is clean, the workflow shall preserve existing targeted tests, expected-assertion Red requirements, approvals and final full gate, without adding diagnostics to gate automatically or recording it as TDD/approval evidence. | TEST-DIAGFLOW-003 |
| REQ-DIAGFLOW-004 (test-only) | When bilingual documentation describes diagnostics, it shall state prerequisites, CLI/JSON/exit examples, project scope and ignores, trusted-config execution, no automatic fixes/install, snapshot limits, failure recovery and Python/Rust as future profiles, without claiming measured speed or AI-cost savings. | TEST-DIAGFLOW-004 |
## PASS conditions and counterexamples
| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-DIAGFLOW-001` | 同じprojectをsource/wrapper/initコピーから実行しclean/error/missingの0/1/2、profile、provider source/version/status/files、正規化診断全fieldと理由の有無を照合 | pack helper欠落、stdout追加ログ、status握り潰しを拒否 | TEST-DIAGFLOW-001 | assertion Red→Green、実pack/wrapper/initの0/1/2一致、pack-helper変異検出 |
| `REQ-DIAGFLOW-002` | 手順で適用条件・編集後・未完了通知・範囲外修正禁止を確認(test-only) | 全言語にTS/ESLint必須化、未導入を黙って無視する文言を拒否 | TEST-DIAGFLOW-002 | assertion Red→Green、workflow変異検出。修正試行上限は3回 |
| `REQ-DIAGFLOW-003` | テスト/gate実行契約と履歴が既存controlと同じ、診断だけではRed/承認不成立 | cleanでfull gate省略、compiler errorをassertion Redとして採用する変更を拒否 | TEST-DIAGFLOW-003 | assertion Red→Green、履歴差分0、未初期化gateは拒否。既存共有CLIの3TESTもRefactor成功 |
| `REQ-DIAGFLOW-004` | 両READMEでclean=0/error=1/missing=2を同じfixtureで照合、制限一覧を確認(test-only) | 未導入cleanや未測定の削減率保証を拒否 | TEST-DIAGFLOW-004 | assertion Red→Green、documentation変異検出。公開npm0.1.2には未収録と明記 |
Risk stages: contract=手順で意味が変化; inputs=配布先/対象stack; execution=wrapper/copy/pack; verdict=exit握り潰し; history=既存Red/承認不変; integration=3経路と両言語。
## Design
CLIから相対importできる診断モジュールをlean-sdd-tdd/scripts配下に置く。npm wrapperは既存委譲、initは既存コピーを再利用する。provider依存は対象project側から解決する。経路比較は同じrealpath rootを使い、path表現は共通契約に正規化、時刻と理由の詳細文字列は比較対象外。
手順・参考文書・両READMEを同時更新し、既存gate本体へ新しい必須チェックを注入しない。文書行の受入はtest-only、実行経路は隔離pack fixtureで確認する。
## Assumptions / risks
Oracle: diagnostics-contract と既存gate/Redのcharacterization。仮定: scripts配下の追加で現行files/initが漏れなく同梱する（pack/copy spike）。エージェントの遵守率や性能改善は保証外。ユーザーの2026-10-19の「開発を進めて」により、初期版の実装に進む。JavaScript単独・Python・Rustは次期対応。
Evidence (2026-10-19): dry-runと実pack/extract/initで診断4fileと実行を確認。上記4TESTを含む17件assertion Red→Green、skip0。隔離3変異検出（履歴不変は共通snapshot変異でも検証）。コマンド・未確認環境はdiagnostics-contract末尾、全体gate・レビュー結果はplanに追記する。
Compatibility: 全npm再実行は1102件中1097 pass/1 fail/4既存TODO/skip0。旧 `r35b #364 TypeScript is exactly locked` の2entry固定が追加dev依存を拒否したため、TS固定版・実行時依存0を維持しroot dev依存の一致と全lock entryのdev=trueを確認する形へ修正。関連5TEST成功、runtime追加/transitive dev=false/rootlock不一致の隔離3変異を検出、前後の正常controlも成功。Sonnet5.5差分レビューで不変条件の維持を確認。
