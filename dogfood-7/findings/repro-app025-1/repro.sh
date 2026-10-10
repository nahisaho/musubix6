#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p .runtime
export TMPDIR="$PWD/.runtime"
trap 'rm -rf .runtime; rm -f impact.json' EXIT
go test -count=1 ./...
node ../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs --root "$PWD" impact REQ-HELPER-001 --json > impact.json
cat impact.json
node -e 'const r=require("./impact.json");if(r.reachedFiles.includes("pkg/api.go"))process.exit(1);console.log("CONFIRMED: Go executes helper → API → client, but impact reports no callers")'
