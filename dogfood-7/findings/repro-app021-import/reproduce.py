"""Run from this fixture directory; changed imported behavior needs a new Red."""
from pathlib import Path
import subprocess
import os
import shutil

script = Path("../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs").resolve()
Path(".sdd/tdd.jsonl").unlink(missing_ok=True)
shutil.rmtree("__pycache__", ignore_errors=True)
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
test = Path("test_alias.py")
text = test.read_text()
test.write_text(text.replace("from source import right as read", "from source import wrong as read"))
def run(*args):
    result = subprocess.run(["node", str(script), "--root", str(Path.cwd()), *args])
    print("exit:", result.returncode, flush=True)
run("init")
run("tdd", "red", "TEST-ALIAS-001")
test.write_text(test.read_text().replace("from source import wrong as read", "from source import right as read"))
run("tdd", "green", "TEST-ALIAS-001")
