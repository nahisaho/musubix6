import math
import random
from collections import Counter
from columnar.encoding import choose_encoding, decode
from columnar.storage import build_table
from columnar.joins import hash_join, merge_join, join_count
from columnar.planner import Catalog, plan, execute


def test_seeded_losslessness_and_pruning():
    rng = random.Random(15)
    for _ in range(80):
        values = [rng.choice([None, -0.0, 0.0, -2.0, 1.0, 3.0]) for _ in range(rng.randrange(40))]
        decoded = decode(choose_encoding(values))
        assert decoded == values
        assert [math.copysign(1, v) for v in decoded if v is not None] == [
            math.copysign(1, v) for v in values if v is not None
        ]
        catalog = Catalog({"t": build_table({"k": values}, rng.randrange(1, 8))})
        for target in [None, 0.0, 1.0, 99.0]:
            assert execute(catalog, plan(catalog, {"table": "t", "filters": [("k", "eq", target)]})) == [
                {"k": v} for v in values if v == target
            ]


def test_seeded_join_algorithms_match_nested_loop():
    rng = random.Random(150)
    for _ in range(80):
        left = [{"k": rng.choice([None, 0, 1, 2]), "id": i} for i in range(rng.randrange(12))]
        right = [{"k": rng.choice([None, 0, 1, 2]), "id": i} for i in range(rng.randrange(12))]
        expected = [
            {"l.k": l["k"], "l.id": l["id"], "r.k": r["k"], "r.id": r["id"]}
            for l in left for r in right if l["k"] is not None and l["k"] == r["k"]
        ]
        bag = lambda data: Counter(tuple(sorted(r.items())) for r in data)
        assert bag(hash_join(left, right, ["k"], ["k"])) == bag(expected)
        assert bag(merge_join(left, right, ["k"], ["k"])) == bag(expected)
        assert join_count(left, right, ["k"], ["k"]) == len(expected)
