"""Reset and run the import-alias evidence bypass in this fixture."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent
script = root.parents[2] / ".github/skills/lean-sdd-tdd/scripts/sdd.mjs"
test = root / "test_evidence.py"
original = "from oracle import subject as value\n\n# @id TEST-ALIAS-001 @verifies REQ-ALIAS-001\ndef test_alias_001():\n    assert value() is True\n"
test.write_text(original)
ledger = root / ".sdd/tdd.jsonl"
ledger.unlink(missing_ok=True)
for args in (["init"], ["tdd", "red", "TEST-ALIAS-001"]):
    subprocess.run(["node", str(script), "--root", str(root), *args], cwd=root, check=True)
test.write_text(original.replace("subject as value", "unrelated as value"))
for args in (["tdd", "green", "TEST-ALIAS-001"], ["gate"]):
    subprocess.run(["node", str(script), "--root", str(root), *args], cwd=root, check=True)
print("Implementation unchanged: oracle.subject() is still False")
