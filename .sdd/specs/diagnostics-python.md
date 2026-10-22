---
feature: diagnostics-python
tier: T2
approval: auto
---
# Diagnostics: Python with Ruff and mypy
Goal: root .venvの実ツールでPythonのlintと型診断を取得する。Updated: 2026-10-19。全行必須。
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DIAGPY-001 | When python is selected, the system shall attempt Ruff then mypy independently using root .venv only, Python3.14.x, Ruff0.17.1 and mypy2.4.0; missing/unsupported runtime or a provider's package shall make that provider incomplete without global/ancestor fallback or automatic install, without preventing the other provider from running. | TEST-DIAGPY-001 |
| REQ-DIAGPY-002 | When each tool selects inputs, the system shall inspect project-wide .py/.pyi files (overriding mypy files/modules/packages), exclude .git/.venv and directory symlink traversal, honor native direct-source exclusions and root configuration only (not nested/ancestor discovery), use isolated defaults if no root config applies, and report direct candidate/selected/excluded counts independently; native imported-file diagnostics shall remain visible but not count as direct sources; no selected sources or unavailable counts shall be incomplete. | TEST-DIAGPY-002 |
| REQ-DIAGPY-003 | When Ruff returns complete valid JSON with native exit0/1, the system shall preserve supported native severities, rule codes and messages, converting 1-based Unicode-codepoint columns to common realpath/1-based UTF-16 locations; exit0 empty results shall pass only with selected files; config/crash/invalid/truncated output or unknown severity shall be incomplete, not clean. | TEST-DIAGPY-003 |
| REQ-DIAGPY-004 | When mypy returns complete valid JSONL with native exit0/1, the system shall map error/note to error/info, preserve codes, map native line<=0 to null positions and negative columns to null, and convert known ASCII-line 0-based columns (including 0) to 1-based; unreliable non-ASCII-line columns shall be null with one source=mypy/code=location-unavailable/info notice per realpath+line, never guessed corrections; exit2 (including syntax/duplicate-module blockers) or runtime/config/plugin/protocol failure shall be incomplete with only complete valid records and null counts. | TEST-DIAGPY-004 |
| REQ-DIAGPY-005 | When Python diagnosis runs, the system shall disable bytecode, Ruff/mypy caches, fixes and incremental persistence, preserve project/config/venv/evidence contents, share the 60-second/8-MiB provider budget across probes/selection/checking, and treat executable plugins as trusted code rather than sandboxed code. | TEST-DIAGPY-005 |
## PASS conditions and counterexamples
| REQ | PASS condition | counterexample | TEST/command | evidence |
| --- | --- | --- | --- | --- |
| `REQ-DIAGPY-001` | exact .venv control成功、片方欠落時も他方を取得、旧版/3.13/globalだけは2 | system-site-packagesやPATHのmypyで欠落を隠す、未対応entryを先に実行 | TEST-DIAGPY-001 | 実3.14.4/0.17.1/2.4.0 control、両packageの旧metadataをentry前に拒否、.pth未実行を確認。version APIを3.13/3.15/3.14 prereleaseへ置換すると拒否、3.14 finalは受理。実3.13 runtimeは未確認 |
| `REQ-DIAGPY-002` | root標準設定と設定なし、各除外、.py/.pyi、空集合、独立件数を照合 | 親設定探索、dir symlink追跡、全除外をPASS、選択不明を0で成功化 | TEST-DIAGPY-002 | 3候補/2選択/1除外、import先error、設定優先順・親抑止・files/modules/packages上書き・改行pathを実adapterで確認。共用設定のsectionなし、候補0、全除外も確認 |
| `REQ-DIAGPY-003` | clean control、F821/構文違反、絵文字後の独立UTF-16位置、空配列+exit0はcomplete、空配列+exit1はincomplete | codepoint列をそのままUTF-16扱い、壊れたJSONを[]化、違反終了1の空結果をPASS | TEST-DIAGPY-003 | F821/invalid-syntax・UTF-16を実toolで照合。scripted protocolで4severity・未知severity・不正JSON・byte超過後の有効error保持を確認。空配列+exit1はreview時点の追加指摘。修正後の実行証拠はplan末尾に記録する |
| `REQ-DIAGPY-004` | 正しい代入control、assignment error/note、ASCII列、非ASCII行はnullとinfo1件、空JSONL+exit0はcomplete、空JSONL+exit1/exit2と途中不正行はincomplete | 誤ったUnicode列を表示、終了1の空結果/終了2をcomplete扱い、部分行の復元 | TEST-DIAGPY-004 | ASCII列0→1、未知file/行/列、非ASCII行の2errorにinfo1件、途中不正UTF-8前の有効record保持、構文/duplicate moduleのexit2・code=null→mypy・hint保持を確認。空JSONL+exit1の修正後の実行証拠はplan末尾に記録する |
| `REQ-DIAGPY-005` | 正常/異常前後のcontents差分0、.mypy_cache/.ruff_cache/__pycache__なし、budget超過2 | `-B`欠落、cache有効化、probeごとにbyte/time予算reset | TEST-DIAGPY-005 | source/config/venv/evidenceのhash差分0、cache変異を検出。共通007で累積byte/clock、現行mypyの設定読取FIFOで60013.7ms停止と正常対照を確認 |
Risk stages: contract=ツールごとの選択範囲; inputs=.venv/設定/版; execution=plugin/予算/UTF位置; verdict=空出力とclean混同; history=cache/bytecode/証跡書込; integration=bridgeの同梱。
## Design
既存Node workerからroot .venvのPythonをshellなしで起動する薄いbridgeを使う。`-B -I -S`相当で起動時のglobal/PYTHONPATH/.pth fallbackを避け、選択venvの対応packageだけをロードする。root設定の明示的extend/import/pluginは信頼境界内。
root設定はRuff=.ruff.toml>ruff.toml>pyproject[tool.ruff]、mypy=mypy.ini>.mypy.ini>pyproject[tool.mypy]>setup.cfg[mypy]。角括弧内のsectionがない共用configは適用外、構文不正は未完了。専用fileは存在時に明示指定し、無設定はRuff --isolated/mypy空configでnested/親探索を止める。included=直接候補、checked=native選択済みsource、ignored=差分。Ruff --show-files（includeをpy/pyiに固定）とmypy process_optionsで既存除外にdir symlink/.git/.venv除外をmergeし、同じ選択集合を検査する。選択不明は未完了。
## Assumptions / risks
Notebook/複数project自動横断は対象外。CR/LF付き候補pathは選択前に検出して未完了とする。sourceはPythonのBOM/PEP263とuniversal newline（CR/LF/CRLF、FFは改行ではない）で読む。stderr通知はfileless info/native-stderrとして保持する。import先も共通realpath契約を使う。plugin任意副作用・実行中編集防止は保証しない。
走査時にsymlink先を取得できない場合は、拡張子にかかわらず未完了とする。無関係に見えるdangling symlinkも黙って無視しない保守的な制限である。
隔離spikeは同sessionの `files/diagnostics-v2-spike.mjs` と結果JSON。`-B -I -S`、Ruff --no-cache、mypy --no-incremental --cache-dir=os.devnullでsource/venvのhash差分0、設定優先順位と親設定抑止を確認した。mypyはdir symlinkを辿るため必須除外をmergeし、2 sourceを確認した。
`emoji = "😀"; missing` のUTF-16期待列15に対しmypyのnative列は0-based10だった。非ASCII行の列は未確定と明示する。mypy2.4.0のnative `--exclude` は設定の除外へ追記されるため、必須除外だけを追加する。`-c ""` は設定filesと衝突する反例を確認し使わない。5TESTのassertion Red→Greenと関連変異検出は `diagnostics-v2-tdd-green.log`・`diagnostics-v2-mutations-results.json` に保存。全native API互換性・最終gate・他OS/runtimeは未確認。
