"""AST statement checker. It never imports or executes the checked program."""
from __future__ import annotations

import ast
from dataclasses import dataclass, field

from . import contracts, flow, hm
from .types import ANY, NONE, Type, assignable, parse, union_type


@dataclass(frozen=True)
class Diagnostic:
    code: str
    line: int
    column: int
    message: str


@dataclass
class Result:
    symbols: dict[str, str] = field(default_factory=dict)
    diagnostics: list[Diagnostic] = field(default_factory=list)


class Checker:
    def __init__(self) -> None:
        self.diagnostics: list[Diagnostic] = []

    def report(self, code: str, node: ast.AST, message: str) -> None:
        self.diagnostics.append(Diagnostic(code, getattr(node, "lineno", 1), getattr(node, "col_offset", 0), message))

    # @id CODE-CHECKER-011 @implements REQ-CHECKER-011
    def evaluate(self, node: ast.AST, env: dict[str, str]) -> Type:
        if isinstance(node, ast.BoolOp):
            return union_type(*(self.evaluate(part, env) for part in node.values))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
            self.evaluate(node.operand, env)
            return Type("bool")
        if isinstance(node, ast.Compare):
            self.evaluate(node.left, env)
            for comparator in node.comparators:
                self.evaluate(comparator, env)
            return Type("bool")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "isinstance" and "isinstance" not in env:
            if len(node.args) != 2 or node.keywords or not isinstance(node.args[1], ast.Name):
                raise ValueError("invalid isinstance call")
            if node.args[1].id not in {"bool", "int", "float", "str", "bytes"} or node.args[1].id in env:
                raise ValueError("unsupported isinstance type")
            self.evaluate(node.args[0], env)
            return Type("bool")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in env:
            signature = parse(env[node.func.id])
            if signature.name == "Callable" and hm.free(signature):
                if node.keywords:
                    raise ValueError("unsupported keyword arguments")
                actuals = [str(self.evaluate(arg, env)) for arg in node.args]
                mapping = contracts.bind([str(t) for t in signature.args[:-1]], actuals)
                variables = sorted(hm.free(signature))
                if set(mapping) == set(variables):
                    return parse(contracts.instantiate(variables, str(signature.args[-1]), mapping))
        engine = hm.Engine()
        local = hm.environment(env)
        for name, scheme in local.items():
            if scheme.body.name == "Callable":
                local[name] = hm.Scheme(frozenset(hm.free(scheme.body)), scheme.body)
        return parse(hm.render(engine.resolve(engine.expression(node, local))))

    def value(self, node: ast.AST, env: dict[str, str]) -> Type:
        try:
            return self.evaluate(node, env)
        except ValueError as error:
            self.report("expression", node, str(error))
            return ANY

    # @id CODE-CHECKER-009 @implements REQ-CHECKER-009
    def contextual(self, node: ast.AST, env: dict[str, str], expected: Type | None) -> Type:
        if expected and isinstance(node, ast.List) and expected.name == "list":
            items = [self.contextual(item, env, expected.args[0]) for item in node.elts]
            if all(assignable(item, expected.args[0]) for item in items):
                return expected
            return Type("list", (union_type(*items),))
        if expected and isinstance(node, ast.Dict) and expected.name == "dict" and all(key is not None for key in node.keys):
            keys = [self.contextual(key, env, expected.args[0]) for key in node.keys]
            values = [self.contextual(value, env, expected.args[1]) for value in node.values]
            if all(assignable(key, expected.args[0]) for key in keys) and all(assignable(value, expected.args[1]) for value in values):
                return expected
            return Type("dict", (union_type(*keys), union_type(*values)))
        return self.value(node, env)

    def statements(self, nodes: list[ast.stmt], env: dict[str, str], declared: dict[str, Type], returns: Type | None = None) -> bool:
        for node in nodes:
            if isinstance(node, ast.Assign):
                if any(not isinstance(target, ast.Name) for target in node.targets):
                    self.report("unsupported", node, "only simple name assignments are supported")
                    continue
                for target in node.targets:
                    expected = declared.get(target.id)
                    value = self.contextual(node.value, env, expected)
                    if expected and not assignable(value, expected):
                        self.report("assignment", node, f"{value} is not {expected}")
                    env[target.id] = str(expected or value)
            elif isinstance(node, ast.AnnAssign):
                if not isinstance(node.target, ast.Name):
                    self.report("unsupported", node, "only name annotations are supported")
                    continue
                try:
                    annotation = parse(ast.unparse(node.annotation))
                except ValueError as error:
                    self.report("annotation", node, str(error))
                    continue
                declared[node.target.id] = annotation
                if node.value is not None:
                    value = self.contextual(node.value, env, annotation)
                    if not assignable(value, annotation):
                        self.report("assignment", node, f"{value} is not {annotation}")
                    env[node.target.id] = str(annotation)
            elif isinstance(node, ast.Expr):
                self.value(node.value, env)
            elif isinstance(node, ast.If):
                self.value(node.test, env)
                positive, negative = flow.branches(ast.unparse(node.test), env)
                yes_dead = "Never" in positive.values()
                no_dead = "Never" in negative.values()
                yes_declared, no_declared = dict(declared), dict(declared)
                yes_returns = yes_dead or self.statements(node.body, positive, yes_declared, returns)
                no_returns = no_dead or self.statements(node.orelse, negative, no_declared, returns)
                if yes_returns and no_returns:
                    return True
                continuing = [branch for branch, finished in ((yes_declared, yes_returns), (no_declared, no_returns)) if not finished]
                self.merge_declarations(continuing, declared, node)
                merged = negative if yes_returns else positive if no_returns else flow.join(positive, negative)
                env.clear()
                env.update(merged)
            elif isinstance(node, ast.FunctionDef):
                if node.decorator_list or node.args.defaults or node.args.kw_defaults or node.args.vararg or node.args.kwarg or node.args.posonlyargs or node.args.kwonlyargs:
                    self.report("unsupported", node, "unsupported function signature")
                    continue
                try:
                    parameters = [parse(ast.unparse(arg.annotation)) if arg.annotation else ANY for arg in node.args.args]
                    result = parse(ast.unparse(node.returns)) if node.returns else ANY
                except ValueError as error:
                    self.report("annotation", node, str(error))
                    continue
                env[node.name] = str(Type("Callable", tuple(parameters) + (result,)))
                local = dict(env)
                locals_declared = {arg.arg: t for arg, t in zip(node.args.args, parameters)}
                local.update({name: str(t) for name, t in locals_declared.items()})
                complete = self.statements(node.body, local, locals_declared, result)
                if not complete and not assignable(NONE, result):
                    self.report("return", node, f"implicit None is not {result}")
            elif isinstance(node, ast.Return):
                if returns is None:
                    self.report("unsupported", node, "return outside function")
                    continue
                value = self.value(node.value, env) if node.value else NONE
                if not assignable(value, returns):
                    self.report("return", node, f"{value} is not {returns}")
                return True
            elif isinstance(node, ast.Pass):
                continue
            else:
                self.report("unsupported", node, f"unsupported statement: {type(node).__name__}")
        return False

    # @id CODE-CHECKER-010 @implements REQ-CHECKER-010
    def merge_declarations(self, branches: list[dict[str, Type]], declared: dict[str, Type], node: ast.AST) -> None:
        for branch in branches:
            for name, annotation in branch.items():
                if name in declared and declared[name] != annotation:
                    self.report("annotation", node, f"conflicting branch annotation: {name}")
                else:
                    declared[name] = annotation


# @id CODE-CHECKER-001 @implements REQ-CHECKER-001 REQ-CHECKER-002 REQ-CHECKER-003 REQ-CHECKER-004 REQ-CHECKER-005 REQ-CHECKER-006 REQ-CHECKER-007 REQ-CHECKER-008
def check(source: str) -> Result:
    checker = Checker()
    try:
        tree = ast.parse(source)
    except (SyntaxError, ValueError) as error:
        return Result({}, [Diagnostic("syntax", getattr(error, "lineno", 1) or 1, max(0, (getattr(error, "offset", 1) or 1) - 1), str(error))])
    env: dict[str, str] = {}
    checker.statements(tree.body, env, {})
    return Result(dict(sorted(env.items())), sorted(checker.diagnostics, key=lambda d: (d.line, d.column, d.code)))
