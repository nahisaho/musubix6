from .expr import EvalError, Scope, _compare, _is_num, evaluate, is_true
from .plan import (Aggregate, Distinct, Filter, Join, Limit, OneRow, Project, Scan, Sort,
                   output_scope)


def _norm(v):
    """Type-aware equality key: NULL equals NULL, numbers compare by value, bool is not a number."""
    if v is None:
        return None
    if isinstance(v, bool):
        return ("b", v)
    if isinstance(v, (int, float)):
        return ("n", v)
    return ("s", v)


def _row_key(values):
    return tuple(_norm(v) for v in values)


class Context:
    def __init__(self, catalog, join_strategy=None):
        self.catalog = catalog
        self.join_strategy = join_strategy


# @id CODE-EXE-001 @implements REQ-EXE-002 @implements REQ-EXE-005 @implements REQ-EXE-011
# @implements REQ-EXE-012
def execute_plan(node, ctx):
    if isinstance(node, OneRow):
        return [()]
    if isinstance(node, Scan):
        return list(ctx.catalog.table(node.table).rows)
    if isinstance(node, Filter):
        scope = Scope(output_scope(node.child))
        return [r for r in execute_plan(node.child, ctx) if is_true(evaluate(node.pred, scope, r))]
    if isinstance(node, Join):
        return _join(node, ctx)
    if isinstance(node, Aggregate):
        return _aggregate(node, ctx)
    if isinstance(node, Sort):
        return _sort(node, ctx)
    if isinstance(node, Project):
        scope = Scope(output_scope(node.child))
        return [tuple(evaluate(i.expr, scope, r) for i in node.items)
                for r in execute_plan(node.child, ctx)]
    if isinstance(node, Distinct):
        seen, out = set(), []
        for r in execute_plan(node.child, ctx):
            k = _row_key(r)
            if k not in seen:
                seen.add(k)
                out.append(r)
        return out
    if isinstance(node, Limit):
        rows = execute_plan(node.child, ctx)
        start = node.offset or 0
        return rows[start:] if node.limit is None else rows[start:start + node.limit]
    raise EvalError(f"cannot execute {node!r}")


# @id CODE-EXE-002 @implements REQ-EXE-003 @implements REQ-EXE-004
def _join(node, ctx):
    left = execute_plan(node.left, ctx)
    right = execute_plan(node.right, ctx)
    lscope = Scope(output_scope(node.left))
    rscope = Scope(output_scope(node.right))
    both = Scope(lscope.columns + rscope.columns)
    pad = (None,) * len(rscope.columns)
    strategy = node.strategy
    if strategy == "hash" and ctx.join_strategy == "nested":
        strategy = "nested"
    out = []
    if strategy == "cross":
        return [l + r for l in left for r in right]
    if strategy == "hash":
        index = {}
        for r in right:
            key = [evaluate(rk, rscope, r) for _, rk in node.keys]
            if None not in key:
                index.setdefault(_row_key(key), []).append(r)
        for l in left:
            key = [evaluate(lk, lscope, l) for lk, _ in node.keys]
            matched = False
            if None not in key:
                for r in index.get(_row_key(key), ()):
                    row = l + r
                    if node.residual is None or is_true(evaluate(node.residual, both, row)):
                        out.append(row)
                        matched = True
            if not matched and node.kind == "LEFT":
                out.append(l + pad)
        return out
    for l in left:
        matched = False
        for r in right:
            row = l + r
            if node.cond is None or is_true(evaluate(node.cond, both, row)):
                out.append(row)
                matched = True
        if not matched and node.kind == "LEFT":
            out.append(l + pad)
    return out


# @id CODE-EXE-003 @implements REQ-EXE-006 @implements REQ-EXE-008
def _aggregate(node, ctx):
    rows = execute_plan(node.child, ctx)
    scope = Scope(output_scope(node.child))
    groups = {}
    for r in rows:
        key = [evaluate(k, scope, r) for k in node.group_keys]
        groups.setdefault(_row_key(key), (key, []))[1].append(r)
    if not node.group_keys and not groups:
        groups[()] = ([], [])
    return [tuple(key) + tuple(_agg_value(a, grp, scope) for a in node.aggs)
            for key, grp in groups.values()]


# @id CODE-EXE-004 @implements REQ-EXE-007 @implements REQ-EXE-013
def _agg_value(func, rows, scope):
    name = func.name
    if func.star:
        if name != "COUNT":
            raise EvalError(f"{name}(*) is not supported")
        return len(rows)
    if len(func.args) != 1:
        raise EvalError(f"{name} takes exactly 1 argument")
    values = [v for v in (evaluate(func.args[0], scope, r) for r in rows) if v is not None]
    if func.distinct:
        seen, uniq = set(), []
        for v in values:
            k = _norm(v)
            if k not in seen:
                seen.add(k)
                uniq.append(v)
        values = uniq
    if name == "COUNT":
        return len(values)
    if not values:
        return None
    if name in ("SUM", "AVG"):
        if not all(_is_num(v) for v in values):
            raise EvalError(f"{name} needs numbers")
        total = sum(values)
        return total if name == "SUM" else total / len(values)
    best = values[0]
    for v in values[1:]:
        if _compare("<" if name == "MIN" else ">", v, best):
            best = v
    return best


# @id CODE-EXE-005 @implements REQ-EXE-010
def _sort(node, ctx):
    rows = execute_plan(node.child, ctx)
    scope = Scope(output_scope(node.child))
    keyed = [(r, [evaluate(k.expr, scope, r) for k in node.keys]) for r in rows]
    for idx in range(len(node.keys) - 1, -1, -1):
        classes = {_norm(v)[0] for _, vals in keyed for v in [vals[idx]] if v is not None}
        if len(classes) > 1:
            raise EvalError("ORDER BY key mixes incomparable types")
        keyed.sort(key=lambda rv, i=idx: (rv[1][i] is not None, rv[1][i] if rv[1][i] is not None else 0),
                   reverse=node.keys[idx].desc)
    return [r for r, _ in keyed]
