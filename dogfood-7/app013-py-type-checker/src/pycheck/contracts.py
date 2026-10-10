"""Explicit generic bindings and structural protocol contracts."""
from .types import Type, assignable, parse, substitute, union_type


# @id CODE-CONTRACTS-001 @implements REQ-CONTRACTS-001 REQ-CONTRACTS-002 REQ-CONTRACTS-003 REQ-CONTRACTS-004 REQ-CONTRACTS-005 REQ-CONTRACTS-006 REQ-CONTRACTS-007 REQ-CONTRACTS-008
def instantiate(parameters: list[str], result: str, arguments: dict[str, str]) -> str:
    declarations = [part.split(":", 1) for part in parameters]
    names = [part[0] for part in declarations]
    if len(names) != len(set(names)) or set(names) != set(arguments):
        raise ValueError("generic argument names mismatch")
    mapping = {name: parse(value) for name, value in arguments.items()}
    for part in declarations:
        if len(part) == 2 and not assignable(mapping[part[0]], parse(part[1])):
            raise ValueError(f"generic bound violated: {part[0]}")
    return str(substitute(parse(result), mapping))


def satisfies(actual: dict[str, str], required: dict[str, str], mutable: set[str] | None = None) -> list[str]:
    failures = []
    for name, expected in sorted(required.items()):
        if name not in actual:
            failures.append(f"{name}: missing")
            continue
        a, e = parse(actual[name]), parse(expected)
        if not assignable(a, e) or (name in (mutable or set()) and not assignable(e, a)):
            failures.append(f"{name}: {a} is not {e}")
    return failures


def method_compatible(actual_params: list[str], actual_return: str, required_params: list[str], required_return: str) -> bool:
    return len(actual_params) == len(required_params) and all(
        assignable(parse(required), parse(actual))
        for actual, required in zip(actual_params, required_params)
    ) and assignable(parse(actual_return), parse(required_return))


# @id CODE-CONTRACTS-009 @implements REQ-CONTRACTS-009 REQ-CONTRACTS-010
def bind(formals: list[str], actuals: list[str]) -> dict[str, str]:
    if len(formals) != len(actuals):
        raise ValueError("generic argument arity mismatch")
    bindings: dict[str, Type] = {}

    def has_variable(t: Type) -> bool:
        return t.variable or any(has_variable(part) for part in t.args)

    def needs_union_inference(t: Type) -> bool:
        return (t.name == "Union" and has_variable(t)) or any(needs_union_inference(part) for part in t.args)

    def match(formal: Type, actual: Type) -> None:
        formal = substitute(formal, bindings)
        if not has_variable(formal):
            if not assignable(actual, formal):
                raise ValueError(f"generic argument mismatch: {actual} is not {formal}")
            return
        if formal.variable:
            if formal.name in bindings and bindings[formal.name] != actual:
                raise ValueError(f"conflicting generic binding: {formal.name}")
            bindings[formal.name] = actual
        elif formal.name == "Union" and has_variable(formal):
            variable_parts = [part for part in formal.args if has_variable(part)]
            if len(variable_parts) != 1:
                raise ValueError("ambiguous generic union")
            concrete_parts = [part for part in formal.args if not has_variable(part)]
            alternatives = actual.args if actual.name == "Union" else (actual,)
            remainder = [part for part in alternatives if not any(assignable(part, concrete) for concrete in concrete_parts)]
            if not remainder:
                raise ValueError("ambiguous generic union: variable unconstrained")
            match(variable_parts[0], union_type(*remainder))
        elif formal.name == actual.name and len(formal.args) == len(actual.args) and formal.args:
            for f, a in zip(formal.args, actual.args):
                match(f, a)
        elif not assignable(actual, formal):
            raise ValueError(f"generic argument mismatch: {actual} is not {formal}")

    pairs = [(parse(formal), parse(actual)) for formal, actual in zip(formals, actuals)]
    for formal, actual in sorted(pairs, key=lambda pair: needs_union_inference(pair[0])):
        match(formal, actual)
    for formal, actual in pairs:
        expected = substitute(formal, bindings)
        if not assignable(actual, expected):
            raise ValueError(f"invariant generic argument mismatch: {actual} is not {expected}")
    return {name: str(value) for name, value in sorted(bindings.items())}
