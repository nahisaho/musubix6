# app20 (C++17/CMake LSM) findings

## 1. `tdd stub` for C++ produces junk for class/namespace types and exits 0
Repro: test `#include "lsm/bloom.hpp"` (file missing) using `lsm::BloomFilter f(1000, 0.01); f.add("a");`, then `$S --root . tdd stub TEST-BLOOM-001`.
Actual: generates `template<class...A> inline int f(A&&...)` / `g(...)` (variable names treated as functions), no namespace/class; prints "could not fully stub" but exit code 0.
Expected: stub `namespace lsm { class BloomFilter {...}; }` or clearly fail (non-zero) saying C++ class stubs are unsupported.
Location: stub generation ~sdd.mjs:1583-1886 (message at 1886).
Workaround: hand-write a throwing/non-trivial stub header.

## 2. Weak-Red warning names a garbage setup call
Repro: test does `BloomFilter g = BloomFilter::deserialize(bytes);` with a throwing stub, `tdd red TEST-BLOOM-006`.
Actual: `Red comes from setup call "in"` (identifier is meaningless; the call is the asserted behaviour).
Expected: real call name, or no setup warning.
Location: `setupOrigin` use at sdd.mjs:1979 / output at 1993.
Workaround: `--expect <text>`.

## 3. `--retest` weak Red is labelled "characterization" in gate
Repro: `tdd red T`, fix test, `tdd red T --retest "why"`, `tdd green T`, `gate`.
Actual: `1 weak Red (1 characterization: passed without a failing Red)`; test did fail earlier and was not a characterization test.
Expected: label retest separately (e.g. "1 retest").
Location: sdd.mjs:388 (`charac: !!(r.characterization || r.retest)`) and 2284.
Workaround: none needed (cosmetic/misleading).
