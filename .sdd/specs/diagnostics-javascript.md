---
feature: diagnostics-javascript
tier: T2
approval: auto
---
# Diagnostics: standalone JavaScript
Goal: tsconfigもTypeScriptも不要なJSプロジェクトを既存ESLintで診断する。Updated: 2026-10-19。全行必須。
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DIAGJS-001 | When javascript is selected, the system shall require only root-local ESLint9.x and exactly one root eslint.config.js/mjs/cjs, allowing package symlinks but no ancestor/global tool/config fallback; tsconfig and TypeScript shall not be required, installed or used for selection; missing/unsupported tools or bad/ambiguous config shall be incomplete. | TEST-DIAGJS-001 |
| REQ-DIAGJS-002 | When inputs are selected, the system shall enumerate root .js/.jsx/.mjs/.cjs files recursively excluding .git/node_modules/.venv, never follow directory symlinks, respect flat-config ignores and unconfigured inputs, and diagnose the entire selected set rather than changes only; candidates=checked+ignored, checked>0 shall be required for completion, and no candidates/all ignored shall be incomplete. | TEST-DIAGJS-002 |
| REQ-DIAGJS-003 | When ESLint returns results, the system shall preserve its existing normalization, severities, UTF-16 positions and no-fix/no-cache behavior for both JS and TypeScript profiles; valid lint/parse errors shall be complete, while execution/config/protocol failures shall be incomplete with reasons and only valid retained diagnostics. | TEST-DIAGJS-003 |
## PASS conditions and counterexamples
| REQ | PASS condition | counterexample | TEST/command | evidence |
| --- | --- | --- | --- | --- |
| `REQ-DIAGJS-001` | ESLintのみのrootでclean=0、TS/tsconfigなしでも解析、8.x/親設定だけ/複数設定は2 | 旧TS対象選択の流用でJSを常に未完了、global ESLintで欠落を隠す | TEST-DIAGJS-001 | assertion Red→Green、実ESLint9.39.5・TSなし・local欠落・複数設定を確認。共通loadLocalの既存版判定Refactorも成功 |
| `REQ-DIAGJS-002` | 4拡張子、未編集違反、ignore混在、空集合、循環dir symlinkを独立fixtureで照合 | TS fileをJS対象へ含める、ignore済みをchecked扱い、無限再帰 | TEST-DIAGJS-002 | 6候補/5検査/1除外、3違反のfile名と循環symlink/全除外を照合。列挙/ignore変異を検出 |
| `REQ-DIAGJS-003` | warningのみ0/error1/config例外2、絵文字位置一致、fixable違反は残り差分0 | fix有効化、TSのallowJs/checkJs設定を変更、warningを失敗化 | TEST-DIAGJS-003 | UTF-16・parser error・config例外・contents差分0を確認。共有ESLintの既存fixable controlとfix/cache変異も成功 |
Risk stages: contract=JSにTSを必須化; inputs=local config/列挙; execution=plugin例外/上限; verdict=ignore-onlyの成功化; history=cache/emitなし; integration=既存TS・pack/copyとの共存。
## Design
既存ESLint providerのロード・診断変換を共有し、入力選択だけをprofileで分ける。TS側のtsconfig選択は変更しない。
includedは列挙したJS候補、ignoredはESLintが除外/未設定とした候補、checkedは有効lint結果を得た候補。壊れたsymlink・読取失敗・不正結果は未完了にする。
## Assumptions / risks
Directory symlinkを追わず、file symlinkは実体が読める通常fileのみ許可する。root外の実体は共通契約の絶対pathで表示する。候補拡張子は大文字小文字を区別せず、ESLint設定の適用結果はそのまま尊重する。
追加3TESTのassertion Red→Green、source/wrapper/pack/initの0/1/2、共有providerの既存Refactorを確認した。commandは `sdd.mjs tdd green TEST-DIAGJS-001 TEST-DIAGJS-002 TEST-DIAGJS-003`、session `files/diagnostics-v2-mutations.mjs` の最終51/51のうちJS関連変異も検出した。最終gate・他OS/Node20/22は未確認。npm0.1.2公開版には未収録で、高速化も未測定。
