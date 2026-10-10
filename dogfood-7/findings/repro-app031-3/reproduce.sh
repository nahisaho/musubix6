#!/bin/sh
set -eu
cd "$(dirname "$0")"
S=../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs
go test -count=1 ./...
(cd libs/shared && go test -count=1 ./...)
node "$S" --root "$PWD" init
node "$S" --root "$PWD" impact REQ-LIB-001 --json
printf '%s\n' 'Expected consumer/consumer.go and REQ-APP-001 in the impact result; both are missing.'
