#!/bin/sh
set -eu
cd "$(dirname "$0")"
S=../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs
node "$S" --root "$PWD" init
node "$S" --root "$PWD" tdd red TEST-MODULE-001 --characterization 'Existing root-only contract for module detection probe'
node "$S" --root "$PWD" tdd green TEST-MODULE-001
node "$S" --root "$PWD" gate
if (cd child && go test ./...); then
    echo 'Unexpected: child passed'
    exit 1
else
    echo 'BUG: full gate PASS while nested module tests FAIL'
fi
cat .sdd/config.json
