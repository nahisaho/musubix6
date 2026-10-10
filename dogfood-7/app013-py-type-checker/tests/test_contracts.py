import pytest
import json
import subprocess
import sys
from pycheck import contracts

# @id TEST-CONTRACTS-001 @verifies REQ-CONTRACTS-001
def test_contracts_001(tmp_path):
    assert contracts.instantiate(["T"], "list[T]", {"T": "int"}) == "list[int]"

# @id TEST-CONTRACTS-002 @verifies REQ-CONTRACTS-002
def test_contracts_002(tmp_path):
    assert contracts.instantiate(["T:float"], "T", {"T": "int"}) == "int"
    with pytest.raises(ValueError, match="bound"): contracts.instantiate(["T:int"], "T", {"T": "str"})

# @id TEST-CONTRACTS-003 @verifies REQ-CONTRACTS-003
def test_contracts_003(tmp_path):
    assert contracts.instantiate(["T"], "T", {"T": "str"}) == "str"
    with pytest.raises(ValueError): contracts.instantiate(["T"], "T", {})
    with pytest.raises(ValueError): contracts.instantiate(["T"], "T", {"T": "int", "U": "str"})

# @id TEST-CONTRACTS-004 @verifies REQ-CONTRACTS-004
def test_contracts_004(tmp_path):
    assert contracts.satisfies({"name": "str", "age": "int"}, {"name": "str"}) == []

# @id TEST-CONTRACTS-005 @verifies REQ-CONTRACTS-005
def test_contracts_005(tmp_path):
    assert contracts.satisfies({"name": "int"}, {"name": "str", "age": "int"}) == ["age: missing", "name: int is not str"]

# @id TEST-CONTRACTS-006 @verifies REQ-CONTRACTS-006
def test_contracts_006(tmp_path):
    assert contracts.method_compatible(["float"], "int", ["int"], "float")
    assert not contracts.method_compatible(["int"], "float", ["float"], "int")

# @id TEST-CONTRACTS-007 @verifies REQ-CONTRACTS-007
def test_contracts_007(tmp_path):
    assert contracts.satisfies({"value": "int"}, {"value": "int"}, mutable={"value"}) == []
    assert contracts.satisfies({"value": "bool"}, {"value": "int"}, mutable={"value"})

# @id TEST-CONTRACTS-008 @verifies REQ-CONTRACTS-008
def test_contracts_008(tmp_path):
    assert contracts.bind(["list[T]", "T"], ["list[int]", "int"]) == {"T": "int"}
    with pytest.raises(ValueError): contracts.bind(["T", "T"], ["int", "str"])


# @id TEST-CONTRACTS-009 @verifies REQ-CONTRACTS-009
def test_contracts_009(tmp_path):
    with pytest.raises(ValueError):
        contracts.bind(["list[int]", "T"], ["list[bool]", "str"])
    with pytest.raises(ValueError):
        contracts.bind(["T", "list[T]"], ["int", "list[bool]"])
    with pytest.raises(ValueError):
        contracts.bind(["list[T]", "T"], ["list[bool]", "int"])
    assert contracts.bind(["list[T]"], ["list[bool]"]) == {"T": "bool"}


# @id TEST-CONTRACTS-010 @verifies REQ-CONTRACTS-010
def test_contracts_010(tmp_path):
    assert contracts.bind(["int | T"], ["int | str"]) == {"T": "str"}
    assert contracts.bind(["None | list[T]"], ["None | list[int]"]) == {"T": "int"}
    assert contracts.bind(["T", "int | T"], ["str", "int"]) == {"T": "str"}
    assert contracts.bind(["int | T", "T"], ["int", "str"]) == {"T": "str"}
    assert contracts.bind(["T", "int | T"], ["str", "bool | int"]) == {"T": "str"}
    assert contracts.bind(["int | T", "T"], ["bool | int", "str"]) == {"T": "str"}
    with pytest.raises(ValueError, match="ambiguous"):
        contracts.bind(["T | U"], ["int | str"])
