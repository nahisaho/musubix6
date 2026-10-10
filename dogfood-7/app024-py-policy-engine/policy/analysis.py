"""Conservative static diagnostics on equality constraints."""
from .engine import compile_rules
from .combine import ALGORITHMS

def merge_constraints(left, right):
    merged = dict(left)
    for path, value in right.items():
        if path in merged and merged[path] != value:
            return False
        merged[path] = value
    paths = sorted(merged)
    if any(child.startswith(parent + ".") for parent, child in zip(paths, paths[1:])):
        return False
    return merged

def constraints(tree):
    if tree == ("lit", True):
        return {}
    if tree == ("lit", False):
        return False
    if tree[0] == "and":
        result = {}
        for child in tree[1:]:
            part = constraints(child)
            if part is False:
                return False
            if part is None:
                return None
            result = merge_constraints(result, part)
            if result is False:
                return False
        return result
    if tree[0] == "cmp" and tree[1] == "eq" and tree[2][0] == "path" and tree[3][0] == "lit":
        return {tree[2][1]: tree[3][1]}
    return None

# @id CODE-ANALYSIS-001 @implements REQ-ANALYSIS-001 REQ-ANALYSIS-002 REQ-ANALYSIS-003 REQ-ANALYSIS-004 REQ-ANALYSIS-005 REQ-ANALYSIS-006 REQ-ANALYSIS-007 REQ-ANALYSIS-008 REQ-ANALYSIS-009
def analyze(rules, algorithm="deny-overrides"):
    if algorithm not in ALGORITHMS:
        raise ValueError("unknown algorithm")
    compiled = compile_rules(rules)
    diagnostics = []
    for index, (left, left_tree) in enumerate(compiled):
        for right, right_tree in compiled[index + 1:]:
            pair = [left["id"], right["id"]]
            if algorithm == "first-applicable" and left_tree == ("lit", True) and not left.get("roles"):
                diagnostics.append({"kind": "shadowed", "rules": pair, "certainty": "definite"})
            a, b = constraints(left_tree), constraints(right_tree)
            if a is False or b is False:
                continue
            if isinstance(a, dict) and isinstance(b, dict):
                if merge_constraints(a, b) is False:
                    continue
                certainty = "definite"
            else:
                certainty = "possible"
            if left.get("roles") or right.get("roles"):
                certainty = "possible"
            if left["effect"] != right["effect"]:
                diagnostics.append({"kind": "conflict", "rules": pair, "certainty": certainty})
            elif left_tree == right_tree and left.get("roles", []) == right.get("roles", []):
                diagnostics.append({"kind": "duplicate", "rules": pair, "certainty": certainty})
    return diagnostics
