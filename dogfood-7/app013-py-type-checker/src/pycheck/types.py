"""Immutable type algebra and safe annotation parsing."""
from __future__ import annotations

import ast
from dataclasses import dataclass


@dataclass(frozen=True)
class Type:
    name: str
    args: tuple[Type, ...] = ()

    def __str__(self) -> str:
        if self.name == "Union":
            return " | ".join(map(str, self.args))
        if self.name == "Callable":
            return f"Callable[[{', '.join(map(str, self.args[:-1]))}], {self.args[-1]}]"
        if self.args:
            return f"{self.name}[{', '.join(map(str, self.args))}]"
        return self.name

    @property
    def variable(self) -> bool:
        return not self.args and (self.name.startswith("$") or (self.name[:1].isupper() and (len(self.name) == 1 or self.name[1:].isdigit())))


ANY, NEVER, NONE = Type("Any"), Type("Never"), Type("None")
PRIMITIVES = {"Any", "Never", "None", "bool", "int", "float", "str", "bytes", "object"}
ARITIES = {"list": 1, "set": 1, "dict": 2, "Sequence": 1, "Optional": 1}


def union_type(*items: Type) -> Type:
    flat: set[Type] = set()
    for item in items:
        if item == ANY:
            return ANY
        if item == NEVER:
            continue
        flat.update(item.args if item.name == "Union" else (item,))
    if not flat:
        return NEVER
    ordered = tuple(sorted(flat, key=str))
    return ordered[0] if len(ordered) == 1 else Type("Union", ordered)


def _annotation(node: ast.AST) -> Type:
    if isinstance(node, ast.Name):
        if node.id in PRIMITIVES or Type(node.id).variable:
            return Type(node.id)
        raise ValueError(f"unknown type: {node.id}")
    if isinstance(node, ast.Constant) and node.value is None:
        return NONE
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return parse(node.value)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
        return union_type(_annotation(node.left), _annotation(node.right))
    if isinstance(node, ast.Subscript) and isinstance(node.value, ast.Name):
        name = node.value.id
        parts = node.slice.elts if isinstance(node.slice, ast.Tuple) else [node.slice]
        if name == "Callable":
            if len(parts) != 2 or not isinstance(parts[0], ast.List):
                raise ValueError("Callable requires a parameter list and return type")
            return Type("Callable", tuple(_annotation(x) for x in parts[0].elts) + (_annotation(parts[1]),))
        args = tuple(_annotation(x) for x in parts)
        if name == "Union":
            if not args:
                raise ValueError("empty union")
            return union_type(*args)
        if name == "tuple":
            return Type(name, args)
        if name not in ARITIES or len(args) != ARITIES[name]:
            raise ValueError(f"invalid generic arity: {name}")
        return union_type(args[0], NONE) if name == "Optional" else Type(name, args)
    raise ValueError("unsupported type annotation")


def parse(text: str) -> Type:
    try:
        return _annotation(ast.parse(text, mode="eval").body)
    except (SyntaxError, RecursionError) as error:
        raise ValueError(f"invalid type annotation: {text}") from error


def substitute(t: Type, mapping: dict[str, Type]) -> Type:
    if t.name in mapping and not t.args:
        return mapping[t.name]
    args = tuple(substitute(x, mapping) for x in t.args)
    return union_type(*args) if t.name == "Union" else Type(t.name, args)


def assignable(actual: Type, expected: Type) -> bool:
    if actual in (ANY, NEVER) or expected == ANY or actual == expected:
        return True
    if actual.name == "Union":
        return all(assignable(x, expected) for x in actual.args)
    if expected.name == "Union":
        return any(assignable(actual, x) for x in expected.args)
    if expected.name == "object":
        return True
    numeric = {"bool": 0, "int": 1, "float": 2}
    if actual.name in numeric and expected.name in numeric:
        return numeric[actual.name] <= numeric[expected.name]
    if actual.name == expected.name and len(actual.args) == len(expected.args):
        if actual.name == "Callable":
            return all(assignable(e, a) for a, e in zip(actual.args[:-1], expected.args[:-1])) and assignable(actual.args[-1], expected.args[-1])
        if actual.name in {"Sequence", "tuple"}:
            return all(assignable(a, e) for a, e in zip(actual.args, expected.args))
        return all(assignable(a, e) and assignable(e, a) for a, e in zip(actual.args, expected.args))
    return False


# @id CODE-TYPES-001 @implements REQ-TYPES-001 REQ-TYPES-002 REQ-TYPES-003 REQ-TYPES-004 REQ-TYPES-005 REQ-TYPES-006 REQ-TYPES-007 REQ-TYPES-008
def canonical(text: str) -> str:
    return str(parse(text))


def compatible(actual: str, expected: str) -> bool:
    return assignable(parse(actual), parse(expected))


def replace(text: str, bindings: dict[str, str]) -> str:
    return str(substitute(parse(text), {key: parse(value) for key, value in bindings.items()}))
