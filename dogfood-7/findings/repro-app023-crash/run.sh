#!/bin/sh
set -eu
cd "$(dirname "$0")"
ulimit -c 0
S="../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs"
node "$S" init --root "$PWD"
ORM_CRASH=1 node "$S" tdd red TEST-CRASH-001 --root "$PWD"
node "$S" tdd green TEST-CRASH-001 --root "$PWD"
node "$S" gate --root "$PWD"
