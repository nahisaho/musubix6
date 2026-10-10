import ast

assert isinstance(ast.parse("int | None", mode="eval").body, ast.BinOp)
assert type(ast.parse("True", mode="eval").body.value) is bool
assert isinstance(ast.parse("isinstance(x, str)", mode="eval").body, ast.Call)
assert ast.parse("x: list[int] = []").body[0].annotation.value.id == "list"
print("AST spike: unions, bool, narrowing and generic annotations verified")
