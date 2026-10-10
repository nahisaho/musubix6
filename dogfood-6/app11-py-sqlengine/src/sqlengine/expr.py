import re

from .errors import SqlError
from .ast import Between, Binary, Column, Func, InList, IsNull, Like, Literal, Unary

AGGREGATES = frozenset({"COUNT", "SUM", "AVG", "MIN", "MAX"})


class EvalError(SqlError):
    pass


class Scope:
    def __init__(self, columns):
        self.columns = list(columns)

    # @id CODE-EXP-001 @implements REQ-EXP-012
    def resolve(self, table, name):
        hits = [i for i, (t, n) in enumerate(self.columns)
                if n.lower() == name.lower()
                and (table is None or (t is not None and t.lower() == table.lower()))]
        label = f"{table}.{name}" if table else name
        if not hits:
            raise EvalError(f"unknown column {label}")
        if len(hits) > 1:
            raise EvalError(f"ambiguous column {label}")
        return hits[0]


# @id CODE-EXP-002 @implements REQ-EXP-004 @implements REQ-EXP-005 @implements REQ-EXP-006
def _check_bool(v):
    if v is not None and not isinstance(v, bool):
        raise EvalError(f"boolean expected, got {v!r}")
    return v


def and3(a, b):
    if a is False or b is False:
        return False
    return None if a is None or b is None else True


def or3(a, b):
    if a is True or b is True:
        return True
    return None if a is None or b is None else False


def not3(a):
    return None if a is None else not a


def is_true(v):
    return v is True


def _is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


# @id CODE-EXP-003 @implements REQ-EXP-001 @implements REQ-EXP-002
def _arith(op, a, b):
    if a is None or b is None:
        return None
    if not (_is_num(a) and _is_num(b)):
        raise EvalError(f"operator {op} needs numbers, got {a!r}, {b!r}")
    if op == "+":
        return a + b
    if op == "-":
        return a - b
    if op == "*":
        return a * b
    if b == 0:
        raise EvalError("division by zero")
    if isinstance(a, int) and isinstance(b, int):
        q = abs(a) // abs(b)
        q = q if (a < 0) == (b < 0) else -q
        return q if op == "/" else a - b * q
    if op == "/":
        return a / b
    import math
    return math.fmod(a, b)


# @id CODE-EXP-004 @implements REQ-EXP-003
def _compare(op, a, b):
    if a is None or b is None:
        return None
    if _is_num(a) and _is_num(b):
        pass
    elif type(a) is not type(b):
        raise EvalError(f"cannot compare {a!r} with {b!r}")
    if op == "=":
        return a == b
    if op == "<>":
        return a != b
    if op == "<":
        return a < b
    if op == "<=":
        return a <= b
    if op == ">":
        return a > b
    return a >= b


# @id CODE-EXP-005 @implements REQ-EXP-010
def like_match(value, pattern):
    regex = "".join(".*" if ch == "%" else "." if ch == "_" else re.escape(ch) for ch in pattern)
    return re.fullmatch(regex, value, re.DOTALL) is not None


def _scalar(name, args):
    if name == "COALESCE":
        if not args:
            raise EvalError("COALESCE needs arguments")
        return next((a for a in args if a is not None), None)
    if name == "NULLIF":
        if len(args) != 2:
            raise EvalError("NULLIF takes 2 arguments")
        eq = _compare("=", args[0], args[1])
        return None if eq is True else args[0]
    if name in ("UPPER", "LOWER", "LENGTH", "ABS"):
        if len(args) != 1:
            raise EvalError(f"{name} takes 1 argument")
        v = args[0]
        if v is None:
            return None
        if name == "ABS":
            if not _is_num(v):
                raise EvalError("ABS needs a number")
            return abs(v)
        if not isinstance(v, str):
            raise EvalError(f"{name} needs text")
        return {"UPPER": v.upper, "LOWER": v.lower, "LENGTH": lambda: len(v)}[name]()
    if name in AGGREGATES:
        raise EvalError(f"aggregate {name} not allowed here")
    raise EvalError(f"unknown function {name}")


# @id CODE-EXP-006 @implements REQ-EXP-007 @implements REQ-EXP-008 @implements REQ-EXP-009
# @implements REQ-EXP-011 @implements REQ-EXP-013 @implements REQ-EXP-014
def evaluate(node, scope, row):
    if isinstance(node, Literal):
        return node.value
    if isinstance(node, Column):
        return row[scope.resolve(node.table, node.name)]
    if isinstance(node, Unary):
        v = evaluate(node.operand, scope, row)
        if node.op == "NOT":
            return not3(_check_bool(v))
        if v is None:
            return None
        if not _is_num(v):
            raise EvalError("unary minus needs a number")
        return -v
    if isinstance(node, Binary):
        op = node.op
        if op == "AND" or op == "OR":
            left = _check_bool(evaluate(node.left, scope, row))
            if (op == "AND" and left is False) or (op == "OR" and left is True):
                return left
            right = _check_bool(evaluate(node.right, scope, row))
            return and3(left, right) if op == "AND" else or3(left, right)
        a = evaluate(node.left, scope, row)
        b = evaluate(node.right, scope, row)
        if op == "||":
            if a is None or b is None:
                return None
            if not (isinstance(a, str) and isinstance(b, str)):
                raise EvalError("|| needs text")
            return a + b
        if op in ("+", "-", "*", "/", "%"):
            return _arith(op, a, b)
        return _compare(op, a, b)
    if isinstance(node, IsNull):
        v = evaluate(node.operand, scope, row)
        return (v is not None) if node.negated else (v is None)
    if isinstance(node, InList):
        x = evaluate(node.operand, scope, row)
        result = False
        for item in node.items:
            result = or3(result, _compare("=", x, evaluate(item, scope, row)))
        return not3(result) if node.negated else result
    if isinstance(node, Between):
        x = evaluate(node.operand, scope, row)
        lo = evaluate(node.low, scope, row)
        hi = evaluate(node.high, scope, row)
        result = and3(_compare(">=", x, lo), _compare("<=", x, hi))
        return not3(result) if node.negated else result
    if isinstance(node, Like):
        v = evaluate(node.operand, scope, row)
        p = evaluate(node.pattern, scope, row)
        if v is None or p is None:
            return None
        if not (isinstance(v, str) and isinstance(p, str)):
            raise EvalError("LIKE needs text")
        result = like_match(v, p)
        return not result if node.negated else result
    if isinstance(node, Func):
        if node.star or node.distinct:
            raise EvalError(f"aggregate {node.name} not allowed here")
        return _scalar(node.name, [evaluate(a, scope, row) for a in node.args])
    raise EvalError(f"cannot evaluate {node!r}")
