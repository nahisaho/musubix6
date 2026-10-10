import ast
from pathlib import Path
import subprocess

root = Path.cwd()
script = root.parents[2] / ".github/skills/lean-sdd-tdd/scripts/sdd.mjs"
generated = root / "src/scope_demo/api.py"
generated.unlink(missing_ok=True)
command = ["node", str(script), "--root", str(root)]
subprocess.run(command + ["init"], check=True)
subprocess.run(command + ["tdd", "stub", "TEST-SCOPE-001"], check=True)
names = {node.name for node in ast.parse(generated.read_text()).body if isinstance(node, ast.FunctionDef)}
print(f"Actual: {sorted(names)}; expected: ['first']")
assert names == {"first", "unrelated"}, "The historical defect no longer reproduces."
