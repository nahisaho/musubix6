#!/bin/sh
set -eu
cd "$(dirname "$0")"
S=/home/nahisaho/GitHub/musubix6/.github/skills/lean-sdd-tdd/scripts/sdd.mjs
go test ./...
node "$S" --root "$PWD" impact CODE-BASE-001 --json
node "$S" --root "$PWD" impact internal/model/shell.go --json
