"""Run from this fixture directory; all-skipped pytest must be rejected."""
from pathlib import Path
import subprocess

script = Path("../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs").resolve()
ledger = Path(".sdd/tdd.jsonl")
ledger.unlink(missing_ok=True)
for args in (
    ["init"],
    ["tdd", "red", "TEST-SKIP-001", "--characterization", "Probe all-skipped pytest rejection"],
    ["tdd", "green", "TEST-SKIP-001"],
    ["gate"],
):
    result = subprocess.run(["node", str(script), "--root", str(Path.cwd()), *args])
    print("exit:", result.returncode, flush=True)
