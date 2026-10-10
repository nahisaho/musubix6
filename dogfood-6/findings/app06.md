# app06 (C11 + CMake/CTest kvstore) findings

## F1. `tdd red` REFUSED hint for `approval: auto` T2 specs says `approve prepare`, which does not lock
- Repro: T2 spec with `approval: auto`, no lock; `node sdd.mjs --root . tdd red TEST-HT-001`
- Actual: `REFUSED: T2 feature hashtable approval is missing. run: approve prepare hashtable`; `approve prepare` then only prints that for `auto` you must run `approve record <f> --by ai:<reviewer> --review ...` (it records nothing).
- Expected: the hint for auto specs should name `approve record <feature> --by ai:<reviewer> --review "<summary>"` (prepare is only the human flow).
- Location: sdd.mjs:1332 (hint string is not conditional on `spec.approval`).
- Workaround: ran `approve record` directly.

## F2. `tdd stub` for C generates a header that does not compile for pointer args / struct-returning calls
- Repro: tests/test_hashtable.c calling `ht_put(t, (uint8_t *)k, 3, (const uint8_t *)"val", 3)`, `ht_get(t, &c, 1)`, `ht_entry_t *e = ht_get(...); e->vlen` with only `#include "kv/hashtable.h"` missing; run `tdd stub TEST-HT-001` then `tdd red TEST-HT-001`.
- Actual: stub prints "stubbed (throwing, Red-safe)" but writes `static inline void * ht_put(ht_t * a0, int a1, int a2, int a3, int a4)` (pointer arguments typed `int`; `ht_entry_t` stays an incomplete struct so `e->vlen` cannot compile; `ht_free` returns int). `tdd red` then fails with `expected 'int' but argument is of type 'uint8_t *'` (load error). The message "Red-safe" is misleading; the stub cannot be used (gcc >= 14 makes int-conversion an error).
- Expected: infer pointer types from cast/`&x`/string-literal args (or use `void *`/`const void *` params), and declare structs accessed via `->`; or say "may not compile" when it cannot verify.
- Location: C stub generator in sdd.mjs (search `not implemented:` emitter); docs/stubs.md only says "if the stub does not compile, write it by hand" (known limit), so this is a usability/limit report.
- Workaround: hand-wrote the real header and a throwing `src/hashtable.c`.
(F2 location refined: the C stub generator is `stubC`, sdd.mjs:955-985; emitter at :977.) F2 minimal repro (verified in a scratch dir, gcc 14): `tests/test_d.c` = `#include <stdint.h>`, `#include "harness.h"`, `#include "d.h"`, test body `uint8_t b[4]={1,2,3,4}; CHECK(d_sum(b, 4) == 10);` -> `tdd stub TEST-C-001` writes `tests/d.h` with `static inline int d_sum(int a0, int a1)`; `tdd red TEST-C-001` -> `RED REJECTED ... load/compile error ... new module? run tdd stub <ID>` (re-running stub says "no missing relative imports", so the advice loops).

## F3. `tdd red` "fails with:" shows ctest's summary line, not the assertion message (C/CMake)
- Repro: test prints `file.c:9 CHECK failed: s_add(1, 2) == 3` to stderr and returns 1; `tdd red TEST-S-001`.
- Actual: `RED ok TEST-S-001 (REQ-S-001) 320ms — fails with: 1 - test_s_001_add (Failed)`; the real reason (`CHECK failed: ...`) only appears if `--expect` is wrong. Same for segfault (prints the `***Exception: SegFault` ctest line).
- Expected: the first assertion/stderr line from the test (e.g. `CHECK failed: s_add(1, 2) == 3`), so the agent can judge "Red for the right reason" without re-running.
- Location: reason extraction sdd.mjs:1384 (no ctest/C-style patterns; falls back to the `N - name (Failed)` summary).
- Workaround: `--expect "<assertion text>"`, which works.

## F4. `impact` ignores angle-bracket project includes in C/C++ (`#include <kv/x.h>`)
- Repro (scratch): `include/b/util.h`, `src/x.c` with `#include <b/util.h>` and `@id CODE-C-001 @implements REQ-C-001`; `sdd.mjs --root . impact include/b/util.h`.
- Actual: `reaches 0 file(s) via imports` (x.c and its REQ not listed). With `#include "../include/b/util.h"` it works.
- Expected: `src/x.c` listed (angle includes resolved against project files when a matching path exists; common for `-Iinclude` library headers).
- Location: sdd.mjs:1972, regex only matches `#include "..."`.
- Workaround: use quoted includes (the kvstore app does).

## F5. `impact` resolves C includes by path-suffix over the whole repo -> false positives for same-named headers; also .h<->.c pairing by basename only
- Repro (scratch): `include/a/util.h`, `include/b/util.h`, `src/util.h`; `src/y.c` has `#include "util.h"` (resolves to src/util.h) and `@implements REQ-C-001`; `sdd.mjs --root . impact include/a/util.h`.
- Actual: `! other feature REQ-C-001 [c]: CODE-C-002 (src/y.c) — chain src/y.c ← include/a/util.h` (y.c does not include include/a/util.h). Same for include/b/util.h.
- Expected: quoted includes resolved relative to the including file's directory first, then known include dirs; only that file is a dependency.
- Location: sdd.mjs:1972 `endsWith(m[1]...)` (also strips leading `../`), and :1973 pairs every `x.h` with every `x.c` by basename.
- Workaround: none needed; unique header basenames (impact is then over-approximate only).

## F6. `tdd red|green|refactor` with no TEST-ID prints `undefined not found as "@id TEST-..." annotation in source`
- Repro: `sdd.mjs --root . tdd green`
- Actual: `undefined not found as "@id TEST-..." annotation in source` (exit 2). Expected: usage hint `tdd green <TEST-ID>`.
- Location: sdd.mjs:1325-1327 (`id = pos[2]` not checked before the lookup).

## F7. `tdd refactor|red|green` silently ignore extra TEST-IDs and exit 0
- Repro: `sdd.mjs --root . tdd refactor TEST-HT-001 TEST-HT-002`
- Actual: `REFACTOR ok TEST-HT-001 ...`, exit 0; only one ledger entry (TEST-HT-001) is written, TEST-HT-002 is ignored without any message. Same for `red`/`green` (only first runs).
- Expected: either process all IDs (batch mode is advertised in SKILL.md "Batch") or refuse with "one ID per call".
- Location: sdd.mjs:1325 (`pos[2]` only).
- Workaround: shell loop, one ID per call.
