"""Small validated AST-based ABAC expression language."""
import ast
import operator

COMPARISONS = {
    ast.Eq: "eq", ast.NotEq: "ne", ast.Lt: "lt", ast.LtE: "le",
    ast.Gt: "gt", ast.GtE: "ge", ast.In: "in", ast.NotIn: "not-in",
}
OPERATIONS = {
    "eq": operator.eq, "ne": operator.ne, "lt": operator.lt,
    "le": operator.le, "gt": operator.gt, "ge": operator.ge,
    "in": lambda a, b: a in b, "not-in": lambda a, b: a not in b,
}

# @id CODE-DSL-001 @implements REQ-DSL-001 REQ-DSL-002 REQ-DSL-006 REQ-DSL-008
def parse(text):
    if not isinstance(text, str) or len(text) > 16384:
        raise ValueError("expression too complex")
    try:
        root = ast.parse(text, mode="eval")
    except (SyntaxError, RecursionError) as exc:
        raise ValueError("invalid expression") from exc
    if sum(1 for _ in ast.walk(root)) > 256:
        raise ValueError("expression too complex")

    def convert(node):
        if isinstance(node, ast.Constant) and type(node.value) in (str, int, float, bool, type(None)):
            return ("lit", node.value)
        if isinstance(node, (ast.List, ast.Tuple)):
            items = [convert(item) for item in node.elts]
            if any(item[0] != "lit" for item in items):
                raise ValueError("collections must contain literals")
            return ("lit", tuple(item[1] for item in items))
        if isinstance(node, ast.Attribute):
            parts = []
            while isinstance(node, ast.Attribute):
                parts.append(node.attr)
                node = node.value
            if not isinstance(node, ast.Name) or node.id not in {"subject", "resource", "action", "env"}:
                raise ValueError("invalid attribute root")
            parts.append(node.id)
            if any(part.startswith("_") for part in parts):
                raise ValueError("private attributes forbidden")
            return ("path", ".".join(reversed(parts)))
        if isinstance(node, ast.BoolOp):
            return ("and" if isinstance(node.op, ast.And) else "or", *(convert(v) for v in node.values))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
            return ("not", convert(node.operand))
        if isinstance(node, ast.Compare):
            left = convert(node.left)
            comparisons = []
            for op, value in zip(node.ops, node.comparators):
                name = COMPARISONS.get(type(op))
                if name is None:
                    raise ValueError("unsupported comparison")
                right = convert(value)
                comparisons.append(("cmp", name, left, right))
                left = right
            return comparisons[0] if len(comparisons) == 1 else ("and", *comparisons)
        raise ValueError("unsupported expression")

    return convert(root.body)

# @id CODE-DSL-002 @implements REQ-DSL-003 REQ-DSL-004 REQ-DSL-005 REQ-DSL-007
def evaluate(tree, request):
    def value(node):
        kind = node[0]
        if kind == "lit":
            return node[1]
        if kind == "path":
            result = request
            for part in node[1].split("."):
                if not isinstance(result, dict) or part not in result:
                    raise ValueError("missing attribute: " + node[1])
                result = result[part]
            return result
        if kind == "and":
            return all(bool(value(item)) for item in node[1:])
        if kind == "or":
            return any(bool(value(item)) for item in node[1:])
        if kind == "not":
            return not value(node[1])
        if kind == "cmp":
            try:
                return OPERATIONS[node[1]](value(node[2]), value(node[3]))
            except (TypeError, KeyError) as exc:
                raise ValueError("incompatible comparison") from exc
        raise ValueError("invalid tree")
    return bool(value(tree))
