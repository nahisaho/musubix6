from pathlib import Path
import subprocess

root = Path.cwd()
script = root.parents[2] / ".github/skills/lean-sdd-tdd/scripts/sdd.mjs"
package = root / "src/alias_demo"
(package / "__init__.py").write_text("")
(package / "api.py").unlink(missing_ok=True)
command = ["node", str(script), "--root", str(root)]
subprocess.run(command + ["init"], check=True)
subprocess.run(command + ["tdd", "stub", "TEST-ALIAS-001"], check=True)
result = subprocess.run(["python3", "-m", "pytest", "tests/test_alias.py"], capture_output=True, text=True)
print(result.stdout)
print("Actual: api becomes a function in __init__.py; expected: api.py with first().")
assert result.returncode == 1 and "has no attribute 'first'" in result.stdout
assert not (package / "api.py").exists(), "The historical defect no longer reproduces."
