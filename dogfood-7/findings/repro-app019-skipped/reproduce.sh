#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")"
S="../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs"
rm -f .sdd/tdd.jsonl
node "$S" init --root "$PWD"
node "$S" tdd red TEST-SKIPPED-001 --root "$PWD"
REPRO_VERDICT=skip node "$S" tdd green TEST-SKIPPED-001 --root "$PWD"
REPRO_VERDICT=skip node "$S" gate --root "$PWD"
REPRO_VERDICT=xfail node "$S" tdd green TEST-SKIPPED-001 --root "$PWD"
REPRO_VERDICT=xfail node "$S" gate --root "$PWD"
