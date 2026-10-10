# Columnar analytics engine

Python 3.10+; no runtime dependencies. Run `python3 -m pytest`.

Five modules implement immutable dictionary/RLE columns, columnar tables,
nullable zone maps, vectorized selection/projection/aggregation/grouping,
stable sorting, bag-semantic hash and sort-merge joins, and physical planning.
Scalars are exact builtin `None`, `bool`, `int`, `float`, `str`, or `bytes`;
columns are homogeneous apart from nulls. Signed zero is preserved.
NaN blocks are conservatively unprunable. Join keys containing null never
match; filter equality uses Python equality, including `None == None`.

```python
from columnar.storage import build_table
from columnar.planner import Catalog, plan, execute, explain

c = Catalog({"sales": build_table({"region": ["west", "east", "west"],
                                 "amount": [10, 20, 30]}, block_size=2)})
p = plan(c, {"table": "sales", "filters": [("region", "eq", "west")],
             "group": ["region"], "aggregates": {"total": ("sum", "amount")}})
assert execute(c, p) == [{"region": "west", "total": 40}]
print(explain(p))
```

Query order is scan → residual filters → join → group → sort → project → limit.
`sort=(column, descending)`, `limit=(count, offset)`, and
`join={table, left:[keys], right:[keys], how:inner|left|semi|anti}` are optional.
Inner/left join outputs use `l.` and `r.` prefixes. Projection and grouping use
lists; `aggregates={alias:(sum|min|max|avg|count|count_all, column)}`.
Plans and catalogs are immutable snapshots; explanation returns detached data.
Unknown fields and malformed operands raise `ValueError`.

The `.sdd` directory records 45 requirements, five reviewed T2 specifications,
Red/Green evidence, five regression fixes, and refactor verification.
`spikes/check_runtime.py` verifies runtime assumptions; seeded differential
tests compare compression, pruning, and both joins with reference operations.

SDD commands must run in this directory with `--root "$PWD"`.
The parent worktree's status paths currently make changed-scope evidence empty
for nested app roots; full gate is therefore the authoritative final check.
