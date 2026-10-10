#!/bin/sh
set -eu
cd "$(dirname "$0")"
S=../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs
node "$S" --root "$PWD" init
rm -f .sdd/tdd.jsonl
PROBE_SETUP_EXIT=1 node "$S" --root "$PWD" tdd red TEST-PROBE-001
PROBE_SETUP_EXIT=0 node "$S" --root "$PWD" tdd green TEST-PROBE-001
PROBE_SETUP_EXIT=0 node "$S" --root "$PWD" gate
printf '%s\n' 'Running without the suite-setup early exit now reveals the unchanged failing assertion:'
if go test -count=1 -v ./...; then
	printf '%s\n' 'Unexpected real-test success'
	exit 1
fi
