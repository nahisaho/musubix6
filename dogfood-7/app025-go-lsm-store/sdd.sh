#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p .runtime
export TMPDIR="$PWD/.runtime"
exec node ../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs --root "$PWD" "$@"
