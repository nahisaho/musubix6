---
feature: diagnostics-eslint
tier: T2
approval: auto
---
# Diagnostics: ESLint の診断
Goal: 既存のlint規則に反する箇所を、修正せず取得する。読者は利用者と実装担当者。Updated: 2026-10-19。全行は初期版必須。
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DIAGESL-001 | When ESLint diagnosis starts, the system shall load ESLint 9.x from root/node_modules/eslint (symlinks allowed) and exactly one root `eslint.config.js`, `eslint.config.mjs` or `eslint.config.cjs` with local plugins; missing/unsupported tools, none/multiple/legacy/broken config or plugin loading failure shall be incomplete with a reason, without ancestor/global/NODE_PATH fallback or install. | TEST-DIAGESL-001 |
| REQ-DIAGESL-002 | When supported config loads, the system shall lint non-declaration .js/.jsx/.mjs/.cjs/.ts/.tsx/.mts/.cts inputs selected by root tsconfig via local TS5.9 (JS requires allowJs), not only changed files, honor flat-config ignores and rule severities, disable fix/cache, and report included/checked/ignored counts; absent/unsupported TypeScript, invalid config, references, no eligible inputs or all inputs ignored shall be incomplete. | TEST-DIAGESL-002 |
| REQ-DIAGESL-003 | When lint completes, the system shall report complete even with rule/parse errors, mapping severity 2 to error and 1 to warning with ruleId (or `ESLINT_PARSE` when fatal and ruleId is null), message and common source positions; the inspected set shall exclude ignored or unconfigured files and disclose them in counts. | TEST-DIAGESL-003 |
| REQ-DIAGESL-004 | If ESLint or its configuration aborts instead of returning valid lint results, the system shall report incomplete with a nonempty cause and retain only fully parsed valid diagnostics, never infer clean status from empty or truncated output. | TEST-DIAGESL-004 |
## PASS conditions and counterexamples
| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-DIAGESL-001` | local9+flat config controlを受理、missing/8.x/legacyのみ/plugin例外は未完了 | global ESLintへのfallbackや自動plugin導入を拒否 | TEST-DIAGESL-001 | assertion Red→Green、eslint-version変異検出 |
| `REQ-DIAGESL-002` | clean/ignore混在を計数し未編集fileの違反検出、全8拡張子・allowJs有無・宣言fileを検証、前後差分0 | 全ignore/候補0件/TS未導入をclean扱い、`fix:true`/cache有効化を拒否 | TEST-DIAGESL-002 | assertion Red→Green、ignored/all-ignored/fix/cache変異検出、8拡張子・差分0 |
| `REQ-DIAGESL-003` | rule severity 1/2、fatal parse、Unicode位置を独立fixtureと照合、lint errorでもcomplete | warningをerror化、parseを実行失敗化、未設定fileをchecked扱いする変異を拒否 | TEST-DIAGESL-003 | assertion Red→Green、lint-severity変異検出、UTF-16・parse・未設定counts一致 |
| `REQ-DIAGESL-004` | 成功controlとconfig/plugin throw、signal、壊れた子出力を区別 | 起動失敗+diagnostics=[]からPASSを導く変異を拒否 | TEST-DIAGESL-004 | assertion Red→Green、lint-abort変異検出、子protocol失敗は共通TESTでも検証 |
Risk stages: contract=ignoreで検査範囲が狭まる; inputs=flat config/版/plugin; execution=任意コード・上限; verdict=空出力とcleanの混同; history=cache/保存なし; integration=配布は diagnostics-workflow。
## Design
diagnostics-contract の別子providerでESLint9 APIを使う。diagnostics-typescriptの対象選択を再利用するが、TSの型errorでもlintを続行。TS未導入・未対応版・tsconfig選択失敗はESLintもincomplete。設定pathは絶対パスで明示し、親設定を探索しない。
complete時、includedは拡張子filter後の候補数、checkedはlint結果を得たfile数、ignoredはignore/未設定で検査しないfile数。completeにはincluded=checked+ignoredかつchecked>0が必要。incompleteのcountsは共通契約どおり全nullで、等式は適用しない。ruleId=nullかつ非fatalは `ESLINT_CONFIG`。
## Assumptions / risks
Oracle: fixtureで固定したESLint規則と公開API。仮定: ESLint9 flat configのignore/未設定をAPIで区別できる（config matrix spike）。設定名・ローカル配置の初期制限は `.sdd/plan.md` に記録。pluginの任意副作用は防げず、信頼済みrootに限定する。lint対象外を合格扱いしない。
Evidence (2026-10-19): 実ESLint9.39.5でJSwarning・TS未設定ignore・parser指定後のTS解析を確認。parserの絶対directory require失敗後、exportsのentry解決で成功。9系はnpm上deprecatedだが合意範囲を維持。4TESTはassertion Red→Green、隔離7変異検出（共通末尾コマンド）。plugin任意副作用は保証外。
