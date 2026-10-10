"""Reproduce a multiline Python signature edit accepted as unchanged evidence."""
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
SCRIPT = Path(__file__).resolve().parents[3] / ".github/skills/lean-sdd-tdd/scripts/sdd.mjs"
TEST = HERE / "tests/test_probe.py"
LEDGER = HERE / ".sdd/tdd.jsonl"

def sdd(*args):
    result = subprocess.run(
        ["node", str(SCRIPT), "--root", str(HERE), *args],
        cwd=HERE, text=True, capture_output=True, check=True,
    )
    print(result.stdout, end="")

TEST.write_text(TEST.read_text().replace("allowed=True", "allowed=False"))
if LEDGER.exists():
    LEDGER.unlink()
sdd("init")
sdd("tdd", "red", "TEST-PROBE-001")
sdd("tdd", "red", "TEST-PROBE-002", "--characterization", "Baseline arithmetic invariant")
sdd("tdd", "green", "TEST-PROBE-002")
TEST.write_text(TEST.read_text().replace("allowed=False", "allowed=True"))
sdd("tdd", "green", "TEST-PROBE-001")
sdd("gate")
entries = [json.loads(line) for line in LEDGER.read_text().splitlines()]
target = [entry for entry in entries if entry["test"] == "TEST-PROBE-001"]
assert target[0]["fileSha"] == target[1]["fileSha"]
print("BUG CONFIRMED: failing test input changed, identical Red/Green test hashes, full gate PASS")
