"""Algorithm-W-style inference for immutable Python expressions."""
from __future__ import annotations

import ast
from dataclasses import dataclass

from .types import ANY, NONE, NEVER, Type, assignable, parse, substitute, union_type


def free(t: Type) -> set[str]:
    return {t.name} if t.variable else set().union(*(free(x) for x in t.args))


@dataclass(frozen=True)
class Scheme:
    variables: frozenset[str]
    body: Type


class Engine:
    def __init__(self) -> None:
        self.serial = 0
        self.substitutions: dict[str, Type] = {}

    def fresh(self) -> Type:
        result = Type(f"${self.serial}")
        self.serial += 1
        return result

    def resolve(self, t: Type) -> Type:
        if t.variable and t.name in self.substitutions:
            return self.resolve(self.substitutions[t.name])
        args = tuple(self.resolve(x) for x in t.args)
        return union_type(*args) if t.name == "Union" else Type(t.name, args)

    # @id CODE-HM-009 @implements REQ-HM-009
    def unify(self, actual: Type, expected: Type) -> None:
        actual, expected = self.resolve(actual), self.resolve(expected)
        if actual == expected or ANY in (actual, expected) or actual == NEVER:
            return
        if actual.variable or expected.variable:
            variable, body = (actual, expected) if actual.variable else (expected, actual)
            if variable.name in free(body):
                raise ValueError(f"infinite type: {variable} occurs in {body}")
            self.substitutions[variable.name] = body
            return
        if actual.name == expected.name and len(actual.args) == len(expected.args):
            if actual.args:
                parameter_pairs = zip(actual.args[:-1], expected.args[:-1]) if actual.name == "Callable" else zip(actual.args, expected.args)
                for a, e in parameter_pairs:
                    if actual.name == "Callable":
                        self.unify(e, a)
                    else:
                        self.unify(a, e)
                if actual.name == "Callable":
                    self.unify(actual.args[-1], expected.args[-1])
                if actual.name in {"list", "dict", "set"} and not assignable(self.resolve(expected), self.resolve(actual)):
                    raise ValueError(f"invariant type mismatch: {actual} is not {expected}")
                return
        if not assignable(actual, expected):
            raise ValueError(f"type mismatch: {actual} is not {expected}")

    def instantiate(self, scheme: Scheme) -> Type:
        return substitute(scheme.body, {name: self.fresh() for name in sorted(scheme.variables)})

    def generalize(self, t: Type, env: dict[str, Scheme]) -> Scheme:
        t = self.resolve(t)
        env_free = set().union(*(free(self.resolve(s.body)) - set(s.variables) for s in env.values()))
        return Scheme(frozenset(free(t) - env_free), t)

    def expression(self, node: ast.AST, env: dict[str, Scheme]) -> Type:
        if isinstance(node, ast.Constant):
            names = {bool: "bool", int: "int", float: "float", str: "str", bytes: "bytes", type(None): "None"}
            if type(node.value) not in names:
                raise ValueError("unsupported literal")
            return Type(names[type(node.value)])
        if isinstance(node, ast.Name):
            if node.id not in env:
                raise ValueError(f"undefined symbol: {node.id}")
            return self.instantiate(env[node.id])
        if isinstance(node, ast.Lambda):
            if node.args.defaults or node.args.vararg or node.args.kwarg or node.args.kwonlyargs or node.args.posonlyargs:
                raise ValueError("unsupported lambda parameter form")
            params = tuple(self.fresh() for _ in node.args.args)
            local = dict(env)
            local.update({arg.arg: Scheme(frozenset(), t) for arg, t in zip(node.args.args, params)})
            result = self.expression(node.body, local)
            return self.resolve(Type("Callable", params + (result,)))
        if isinstance(node, ast.Call):
            if node.keywords or any(isinstance(arg, ast.Starred) for arg in node.args):
                raise ValueError("unsupported keyword or spread arguments")
            function = self.resolve(self.expression(node.func, env))
            args = tuple(self.expression(x, env) for x in node.args)
            if function == ANY:
                return ANY
            if function.variable:
                result = self.fresh()
                self.unify(function, Type("Callable", args + (result,)))
                return self.resolve(result)
            if function.name != "Callable":
                raise ValueError(f"not callable: {function}")
            if len(args) != len(function.args) - 1:
                raise ValueError("call arity mismatch")
            for actual, expected in zip(args, function.args[:-1]):
                self.unify(actual, expected)
            return self.resolve(function.args[-1])
        if isinstance(node, ast.List):
            items = tuple(self.expression(x, env) for x in node.elts)
            return Type("list", (union_type(*map(self.resolve, items)) if items else self.fresh(),))
        if isinstance(node, ast.Tuple):
            return Type("tuple", tuple(self.expression(x, env) for x in node.elts))
        if isinstance(node, ast.Dict):
            if any(key is None for key in node.keys):
                raise ValueError("unsupported dictionary spread")
            keys = tuple(self.expression(x, env) for x in node.keys)
            values = tuple(self.expression(x, env) for x in node.values)
            return Type("dict", (union_type(*keys) if keys else self.fresh(), union_type(*values) if values else self.fresh()))
        if isinstance(node, ast.BinOp):
            if not isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div)):
                raise ValueError("unsupported binary operator")
            left = self.resolve(self.expression(node.left, env))
            right = self.resolve(self.expression(node.right, env))
            if left == right == Type("str") and isinstance(node.op, ast.Add):
                return left
            if left.variable:
                self.unify(left, Type("int"))
                left = self.resolve(left)
            if right.variable:
                self.unify(right, Type("int"))
                right = self.resolve(right)
            if ANY in (left, right):
                return ANY
            if not assignable(left, Type("float")) or not assignable(right, Type("float")):
                raise ValueError("arithmetic requires numeric operands")
            return Type("float" if "float" in (left.name, right.name) or isinstance(node.op, ast.Div) else "int")
        if isinstance(node, ast.UnaryOp):
            t = self.expression(node.operand, env)
            if isinstance(node.op, ast.Not):
                return Type("bool")
            self.unify(t, Type("float"))
            return self.resolve(t)
        if isinstance(node, ast.Compare):
            self.expression(node.left, env)
            for part in node.comparators:
                self.expression(part, env)
            return Type("bool")
        if isinstance(node, ast.BoolOp):
            return union_type(*(self.expression(part, env) for part in node.values))
        if isinstance(node, ast.IfExp):
            self.expression(node.test, env)
            return union_type(self.expression(node.body, env), self.expression(node.orelse, env))
        if isinstance(node, ast.Subscript):
            base = self.resolve(self.expression(node.value, env))
            index = self.expression(node.slice, env)
            if base.name in {"list", "Sequence"}:
                self.unify(index, Type("int"))
                return base.args[0]
            if base.name == "dict":
                self.unify(index, base.args[0])
                return base.args[1]
            raise ValueError(f"unsupported subscription: {base}")
        raise ValueError(f"unsupported expression: {type(node).__name__}")


# @id CODE-HM-010 @implements REQ-HM-010
def render(t: Type) -> str:
    names = sorted(free(t), key=lambda x: (1, int(x[1:])) if x.startswith("$") else (0, x))
    mapping = {name: Type(chr(84 + n) if n < 7 else f"T{n}") for n, name in enumerate(names)}
    return str(substitute(t, mapping))


def environment(env: dict[str, str] | None) -> dict[str, Scheme]:
    return {name: Scheme(frozenset(), parse(t)) for name, t in (env or {}).items()}


# @id CODE-HM-001 @implements REQ-HM-001 REQ-HM-002 REQ-HM-003 REQ-HM-004 REQ-HM-005 REQ-HM-006 REQ-HM-007 REQ-HM-008
def infer(source: str, env: dict[str, str] | None = None) -> str:
    engine = Engine()
    try:
        node = ast.parse(source, mode="eval").body
    except SyntaxError as error:
        raise ValueError("invalid expression syntax") from error
    return render(engine.resolve(engine.expression(node, environment(env))))


def infer_let(name: str, value: str, body: str, env: dict[str, str] | None = None) -> str:
    engine = Engine()
    local = environment(env)
    value_type = engine.expression(ast.parse(value, mode="eval").body, local)
    local[name] = engine.generalize(value_type, local)
    return render(engine.resolve(engine.expression(ast.parse(body, mode="eval").body, local)))
