"""Flow refinement uses independent environments for both guard outcomes."""
import ast

from .types import ANY, NONE, Type, parse, union_type


# @id CODE-FLOW-009 @implements REQ-FLOW-009
def runtime_subtype(actual: Type, target: Type) -> bool:
    return actual == target or target.name == "object" or (actual.name == "bool" and target.name == "int")


def _partition(t: Type, target: Type) -> tuple[Type, Type]:
    alternatives = t.args if t.name == "Union" else (t,)
    positive, negative = [], []
    for alternative in alternatives:
        if alternative == ANY:
            positive.append(target)
            negative.append(ANY)
        elif runtime_subtype(alternative, target):
            positive.append(alternative)
        elif runtime_subtype(target, alternative):
            positive.append(target)
            negative.append(alternative)
        else:
            negative.append(alternative)
    return union_type(*positive), union_type(*negative)


# @id CODE-FLOW-001 @implements REQ-FLOW-001 REQ-FLOW-002 REQ-FLOW-003 REQ-FLOW-004 REQ-FLOW-005 REQ-FLOW-006 REQ-FLOW-007 REQ-FLOW-008
def join(left: dict[str, str], right: dict[str, str]) -> dict[str, str]:
    return {name: str(union_type(parse(left[name]), parse(right[name]))) for name in left.keys() & right.keys()}


def _branches(node: ast.AST, env: dict[str, str]) -> tuple[dict[str, str], dict[str, str]]:
    if isinstance(node, ast.BoolOp):
        active = dict(env)
        exits = []
        conjunction = isinstance(node.op, ast.And)
        for part in node.values:
            positive, negative = _branches(part, active)
            active = positive if conjunction else negative
            exits.append(negative if conjunction else positive)
        merged = exits[0]
        for exit_env in exits[1:]:
            merged = join(merged, exit_env)
        return (active, merged) if conjunction else (merged, active)
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
        positive, negative = _branches(node.operand, env)
        return negative, positive
    name, target, inverted = None, None, False
    if isinstance(node, ast.Compare) and len(node.ops) == 1 and isinstance(node.left, ast.Name):
        value = node.comparators[0]
        if isinstance(value, ast.Constant) and value.value is None and isinstance(node.ops[0], (ast.Is, ast.IsNot)):
            name, target = node.left.id, NONE
            inverted = isinstance(node.ops[0], ast.IsNot)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "isinstance" and len(node.args) == 2 and not node.keywords:
        variable, annotation = node.args
        if isinstance(variable, ast.Name) and isinstance(annotation, ast.Name):
            if "isinstance" not in env and annotation.id not in env and annotation.id in {"bool", "int", "float", "str", "bytes"}:
                name, target = variable.id, Type(annotation.id)
    positive, negative = dict(env), dict(env)
    if name in env and target is not None:
        yes, no = _partition(parse(env[name]), target)
        positive[name], negative[name] = str(yes), str(no)
    return (negative, positive) if inverted else (positive, negative)


def branches(condition: str, env: dict[str, str]) -> tuple[dict[str, str], dict[str, str]]:
    try:
        return _branches(ast.parse(condition, mode="eval").body, env)
    except SyntaxError as error:
        raise ValueError("invalid guard syntax") from error
