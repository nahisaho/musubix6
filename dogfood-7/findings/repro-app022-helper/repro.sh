#!/bin/sh
set -eu
cd "$(dirname "$0")"
S="../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs"
sed -i 's/return 1/return 2/' test_oracle.py
node "$S" --root "$PWD" init
node "$S" --root "$PWD" tdd red TEST-ORACLE-001
sed -i 's/return 2/return 1/' test_oracle.py
node "$S" --root "$PWD" tdd green TEST-ORACLE-001
node "$S" --root "$PWD" gate
