#!/bin/sh
set -eu
cd "$(dirname "$0")"
S=/home/nahisaho/GitHub/musubix6/.github/skills/lean-sdd-tdd/scripts/sdd.mjs
node --test --test-name-pattern 'TEST-NOMATCH-001(?![0-9A-Za-z])' TEST-NOMATCH-001.test.mjs
node "$S" --root "$PWD" tdd red TEST-NOMATCH-001 --characterization 'Probe must be rejected because no test actually matched'
node "$S" --root "$PWD" tdd green TEST-NOMATCH-001
node "$S" --root "$PWD" gate
