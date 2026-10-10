import hashlib
from pathlib import Path
import subprocess

script = Path("../../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs").resolve()
digest = hashlib.sha256(Path(".sdd/specs/probe.md").read_bytes()).hexdigest()
Path("malformed-review.md").write_text(
    "spec: sha256:" + "0" * 64 + "\nverdict: pass\nopen: 0\n"
    "This review actually cites the wrong specification above.\n"
    "Unrelated diagnostic artifact hash: " + digest + "\n"
)
command = ["node", str(script), "--root", str(Path.cwd())]
subprocess.run(command + ["review", "check", "malformed-review.md", "--feature", "probe"], check=True)
subprocess.run(command + ["approve", "record", "probe", "--by", "ai:fixture-reviewer",
                          "--review", "malformed-review.md"], check=True)
