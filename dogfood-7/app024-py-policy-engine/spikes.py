"""Runtime assumptions supporting the five T2 specifications."""
import ast
import copy
import itertools
from fnmatch import fnmatchcase

tree = ast.parse('subject.age == 18 or resource.owner == "a" and action.name in ["read"]', mode="eval")
assert isinstance(tree.body, ast.BoolOp) and isinstance(tree.body.values[1], ast.BoolOp)
assert fnmatchcase("docs/one", "docs/*") and not fnmatchcase("READ", "read")
assert len(list(itertools.product(range(4), repeat=2))) == 16
original = {"subject": {"roles": ["reader"]}}
cloned = copy.deepcopy(original)
cloned["subject"]["roles"].append("writer")
assert original["subject"]["roles"] == ["reader"]
assert len(list(ast.walk(ast.parse("True", mode="eval")))) == 2
print("five T2 runtime assumptions verified")
