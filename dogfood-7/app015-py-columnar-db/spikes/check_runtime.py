from copy import deepcopy
from types import MappingProxyType

assert list(dict.fromkeys(["b", None, "b", "a"])) == ["b", None, "a"]
try:
    MappingProxyType({"x": (1,)})["x"] = (2,)
except TypeError:
    pass
else:
    raise AssertionError("mutable mapping proxy")
assert [None for _ in range(2)] == [None, None]
assert len([(l, r) for l in [1, 1] for r in [1, 1, 1]]) == 6
query = {"filters": [["x", "eq", 1]]}
copy = deepcopy(query)
query["filters"][0][2] = 2
assert copy["filters"][0][2] == 1
assert sorted([("a", 2), ("b", 2)], key=lambda x: x[1], reverse=True)[0][0] == "a"
print("six runtime design assumptions verified")
