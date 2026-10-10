import pytest
import json
import subprocess
import sys
from pycheck import checker

# @id TEST-CHECKER-001 @verifies REQ-CHECKER-001
def test_checker_001(tmp_path):
    result = checker.check("x = 1\ny = [x, 2]\n")
    assert result.symbols == {"x": "int", "y": "list[int]"}
    assert not result.diagnostics

# @id TEST-CHECKER-002 @verifies REQ-CHECKER-002
def test_checker_002(tmp_path):
    result = checker.check("x: int = \"bad\"\n")
    assert [(d.code, d.line, d.column) for d in result.diagnostics] == [("assignment", 1, 0)]

# @id TEST-CHECKER-003 @verifies REQ-CHECKER-003
def test_checker_003(tmp_path):
    assert not checker.check("def f(x: int) -> int:\n    return x + 1\ny = f(2)\n").diagnostics
    assert checker.check("def f(x: int) -> str:\n    return x\n").diagnostics[0].code == "return"
    assert checker.check("def f(x: int) -> int:\n    return x\ny = f(\"bad\")\n").diagnostics[0].code == "expression"
    assert checker.check("def f(x: int) -> int:\n    if x:\n        return x\n").diagnostics[0].code == "return"

# @id TEST-CHECKER-004 @verifies REQ-CHECKER-004
def test_checker_004(tmp_path):
    source = "x: int | None = None\nif x is not None:\n    y: int = x\n"
    assert not checker.check(source).diagnostics

# @id TEST-CHECKER-005 @verifies REQ-CHECKER-005
def test_checker_005(tmp_path):
    result = checker.check("x = (\n")
    assert result.diagnostics[0].code == "syntax"
    assert result.diagnostics[0].line == 1

# @id TEST-CHECKER-006 @verifies REQ-CHECKER-006
def test_checker_006(tmp_path):
    assert checker.check("while True:\n    pass\n").diagnostics[0].code == "unsupported"

# @id TEST-CHECKER-007 @verifies REQ-CHECKER-007
def test_checker_007(tmp_path):
    result = checker.check("flag = True\nif flag:\n    x = 1\ny = x\n")
    assert result.diagnostics[-1].code == "expression"
    assert "undefined" in result.diagnostics[-1].message

# @id TEST-CHECKER-008 @verifies REQ-CHECKER-008
def test_checker_008(tmp_path):
    path = tmp_path / "sample.py"
    path.write_text("x: int = \"bad\"\n")
    completed = subprocess.run([sys.executable, "-m", "pycheck", "--json", str(path)], capture_output=True, text=True)
    assert completed.returncode == 1
    assert json.loads(completed.stdout)["diagnostics"][0]["code"] == "assignment"


# @id TEST-CHECKER-009 @verifies REQ-CHECKER-009
def test_checker_009(tmp_path):
    assert not checker.check("xs: list[int] = []\nds: dict[str, int] = {}\n").diagnostics
    assert not checker.check("xs: list[list[int]] = [[]]\n").diagnostics
    assert checker.check("source = [True]\nxs: list[int] = source\n").diagnostics[0].code == "assignment"


# @id TEST-CHECKER-010 @verifies REQ-CHECKER-010
def test_checker_010(tmp_path):
    source = "flag = True\nif flag:\n    x: int = 1\nelse:\n    x: int = 2\nx = \"bad\"\n"
    result = checker.check(source)
    assert result.diagnostics and result.diagnostics[-1].code == "assignment"
    source = "flag = True\nif flag:\n    x: int = 1\nelse:\n    x: str = \"s\"\n"
    assert checker.check(source).diagnostics[-1].code == "annotation"


# @id TEST-CHECKER-011 @verifies REQ-CHECKER-011
def test_checker_011(tmp_path):
    source = "x: int | None = 1\nif x is not None and isinstance(x, int):\n    y = x + 1\n"
    assert not checker.check(source).diagnostics
    source = "x: int | str | None = 1\nif not (isinstance(x, str) or x is None):\n    y: int = x\n"
    assert not checker.check(source).diagnostics
