#!/bin/sh
set -eu
cd "$(dirname "$0")"
S="../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs"
node "$S" --root "$PWD" init
node "$S" --root "$PWD" tdd red TEST-SKIP-001
SKIP_REPRO=1 node "$S" --root "$PWD" tdd green TEST-SKIP-001
SKIP_REPRO=1 node "$S" --root "$PWD" gate
