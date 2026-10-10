#!/bin/sh
set -eu
cd "$(dirname "$0")"
S=/home/nahisaho/GitHub/musubix6/.github/skills/lean-sdd-tdd/scripts/sdd.mjs
rm -f internal/runtimev1/runtimev1_stub.go
node "$S" --root "$PWD" init
node "$S" --root "$PWD" tdd stub TEST-GAUGE-001
cat internal/runtimev1/runtimev1_stub.go
go test ./...
