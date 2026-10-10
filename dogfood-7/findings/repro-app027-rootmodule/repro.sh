#!/bin/sh
set -eu
cd "$(dirname "$0")"
S="../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs"
node "$S" --root "$PWD" init
go test ./...
node "$S" --root "$PWD" impact CODE-CORE-001 --json
