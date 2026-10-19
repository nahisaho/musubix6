---
feature: diagnostics-rust
tier: T2
approval: human
---
# Diagnostics: offline cargo check
Goal: 単一Rust packageのcompiler診断を、projectの生成物を増やさず取得する。Updated: 2026-10-19。全行必須。
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DIAGRUST-001 | When rust is selected, the system shall require installed cargo/rustc1.99.x verified by probes in project-root cwd with rustup auto-install disabled, root Cargo.toml, existing Cargo.lock and an existing external Cargo home, and admit only a root single-package project whose workspace root is the selected realpath; multiple workspace members, absent targets/tools/lock, project-internal Cargo home or unsupported toolchains shall be incomplete without automatic rustup/tool/dependency download. | TEST-DIAGRUST-001 |
| REQ-DIAGRUST-002 | When checking, the system shall use cargo check --all-targets --offline --locked with default features, JSON messages and color disabled, overriding both target-dir and build.build-dir into an owned private external temporary directory; project source/config/Cargo.lock and existing build outputs shall remain unchanged, missing offline dependencies shall be incomplete, and only normal external Cargo dependency-cache management/materialization may persist, with auto-clean disabled. | TEST-DIAGRUST-002 |
| REQ-DIAGRUST-003 | When cargo returns a valid finished compilation report, the system shall return complete for success or compiler errors belonging to the selected package's metadata targets (including compilation of build.rs), map compiler errors/warnings/notes/help and codes to the common schema, and normalize primary spans using source text and UTF-16 positions; foreign-package compiler errors, malformed output, metadata/config/dependency/build-script runtime abort or signals shall be incomplete with retained valid diagnostics. | TEST-DIAGRUST-003 |
| REQ-DIAGRUST-004 | When reporting coverage, the system shall count distinct project target root source paths from metadata as included, roots observed in compiler-message/artifact records as checked and ignored=0 (no separate source-ignore filter), requiring 0<checked<=included for completion without requiring equality after early errors or feature-disabled targets; counts shall not claim every module, feature combination or statement was checked and shall be null on incomplete. | TEST-DIAGRUST-004 |
| REQ-DIAGRUST-005 | When a Rust worker finishes, fails or exceeds its 180-second/8-MiB cumulative budget, the owning parent shall stop owned workers/ordinary descendants and remove only its own private scratch before returning; cleanup failure shall force INCOMPLETE with reasons and valid retained diagnostics; trusted build scripts/proc macros shall not be described as sandboxed. | TEST-DIAGRUST-005 |
## PASS conditions and counterexamples
| REQ | PASS condition | counterexample | TEST/command | evidence |
| --- | --- | --- | --- | --- |
| `REQ-DIAGRUST-001` | 1.99/単一package control成功、lockなし/旧版/複数workspace/未導入toolchain/内部Cargo homeは2 | workspaceの一部だけで全体PASS、rustup自動取得、project内cache書込み | TEST-DIAGRUST-001 | 実cargo/rustc1.99.0、lock欠落・未導入override・内部home拒否、scripted旧cargoをcheck前拒否。実2-package workspaceもadapterが拒否 |
| `REQ-DIAGRUST-002` | lib/bin/test/exampleを取得、source/lock/config/build出力差分0、offline依存不足2、Cargo cache例外を明示 | --locked/--offline/--all-targets欠落、config指定の共有build-dir更新、自動cache削除 | TEST-DIAGRUST-002 | example違反を取得しproject hash差分0、offline依存不足2。scripted argv監査とoffline/locked/all-targets/build-dir/GC変異を検出 |
| `REQ-DIAGRUST-003` | 成功0、型不一致1、warningのみ0、emoji/先頭以外のprimary、primaryなしはnull、成功report後の破損も2、破損前の全有効診断を保持 | exit101の一律判定、compiler-messageなしの成功+不正末尾をPASS、先頭recordだけ保持、最初の非primary spanを採用、byte列の直用 | TEST-DIAGRUST-003 | 実型不一致/構文/build.rs compile/runtime、UTF-16を照合。scripted primary順・位置なし・child note/help・foreign/途中破損/終了順/mixed operational abortを確認。成功+不正末尾と複数record保持はreview時点の追加指摘。修正後の実行証拠はplan末尾に記録する |
| `REQ-DIAGRUST-004` | metadata root集合と独立source名を照合、0 checkedは2、module全数と誤認しない | lib/test同一srcを二重計数、unknownを0で埋める | TEST-DIAGRUST-004 | 実lib/bin/test/exampleのdistinct4/4/0を独立source名と照合。未参照moduleを数えず、件数改変を検出 |
| `REQ-DIAGRUST-005` | 正常/異常/timeoutでscratch不存在、native stderr超過を検出、削除失敗2 | worker finallyだけの削除、共有path削除、180秒制限の無効化 | TEST-DIAGRUST-005 | 正常/短縮timeout後にscratch不存在、削除失敗2とE0308保持。実180097.2msでINCOMPLETE、build-script PID/一時出力とも不存在 |
Risk stages: contract=compileと実行失敗の区別; inputs=toolchain/lock/workspace; execution=build script/予算/cleanup; verdict=protocol不正の成功化; history=私有scratchだけ・証跡なし; integration=親所有とpack/copy。
## Design
root cwdのcargo -V/rustc -vVでproject override後の版を確認し、全呼出でRUSTUP_AUTO_INSTALL=0を使う。CargoのRUSTCにはその同じ絶対entryを渡し、別のbuild.rustcへ逸脱させない（wrapperは信頼コード）。Cargo homeはCARGO_HOME（相対ならroot基準）、なければos.homedir()/.cargoをrealpath化して既存directory/project外を確認する。metadata/checkは同じmanifest/toolchain/offline/locked。CLI --target-dir/--config build.build-dir=私有path/--config cache.auto-clean-frequency="never"はenv/親・root設定より優先。Clippy/全feature/複数packageは対象外。
scratchの所有権と削除は共通runnerの親に置く。workerがSIGKILLされても親が生存していれば削除し、cleanup前に成功を返さない。artifact/messageはsource root集合で重複を除く。native code不在/nullは共通code=rustc、位置はnative順で最初のis_primaryを使い、primaryなしはfile/line/column=nullとする。失敗終了はbuild-finished=falseに加えcompiler errorが必要で、panicなどの実行中断をcomplete扱いしない。
## Assumptions / risks
隔離spike `files/diagnostics-v2-spike.mjs` でCargo homeの .global-cache/.package-cache/.package-cache-mutate、既存archive利用時のregistry/srcへの展開を確認した。永続Cargo cache例外を含む旧hashへのhuman承認後に実装した。本改訂は観測証拠の更新で、要件・許可範囲は変えない。
5TESTのassertion Red→Green、session `diagnostics-v2-mutations.mjs` の関連変異、`diagnostics-v2-rust-real-timeout.mjs` の実180秒・親cleanupが成功。初期実装の51/51検出は全故障の証明ではない。他OS/Node20/22、最終gate、リリース適格性は未確認。任意codeの副作用・完全なnetwork隔離・自己detach・親SIGKILL/電源断でのcleanupは保証しない。
上記は初回実装レビュー時点の観測記録である。以後のRed/Green・変異・gate・未確認範囲の更新は `.sdd/plan.md` 末尾へ追記し、承認済みの要件・許可範囲と区別する。
