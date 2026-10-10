#!/bin/sh
set -eu
cd "$(dirname "$0")"
S=../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs
cp calc/calc_stub.go .original-calc.go
trap 'cp .original-calc.go calc/calc_stub.go; rm -f .original-calc.go' EXIT
node "$S" --root "$PWD" init
node "$S" --root "$PWD" tdd stub TEST-STUBPROOF-001
if grep -q 'func Existing' calc/calc_stub.go; then
  echo "Existing production code survived"
else
  echo "BUG: Existing production function was overwritten"
fi
go test -run '^$' ./...
