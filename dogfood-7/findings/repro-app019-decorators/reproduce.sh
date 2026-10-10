#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")"
S="../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs"
rm -f .sdd/tdd.jsonl
python3 -c 'from pathlib import Path; p=Path("tests/test_cases.py"); p.write_text(p.read_text().replace("\"value\", [1]", "\"value\", [0]"))'
node "$S" init --root "$PWD"
node "$S" tdd red TEST-DECORATORS-001 --characterization "Constant passing baseline" --root "$PWD"
node "$S" tdd green TEST-DECORATORS-001 --root "$PWD"
node "$S" tdd red TEST-DECORATORS-002 --root "$PWD"
python3 -c 'from pathlib import Path; p=Path("tests/test_cases.py"); p.write_text(p.read_text().replace("\"value\", [0]", "\"value\", [1]"))'
node "$S" tdd green TEST-DECORATORS-002 --root "$PWD"
node "$S" gate --root "$PWD"
