from .ast import (Between, Binary, Column, Func, InList, IsNull, Like, Literal, OrderItem,
                  SelectItem, Star, Unary)
from .catalog import CatalogError
from .errors import SqlError
from .expr import AGGREGATES, EvalError, Scope, evaluate
from .plan import (Aggregate, Distinct, Filter, Join, Limit, OneRow, Project, Scan, Sort)


class PlanError(SqlError):
    pass


# @id CODE-PLN-001 @implements REQ-PLN-003
def split_conjuncts(expr):
    if expr is None:
        return []
    if isinstance(expr, Binary) and expr.op == "AND":
        return split_conjuncts(expr.left) + split_conjuncts(expr.right)
    return [expr]


def conjoin(exprs):
    out = None
    for e in exprs:
        out = e if out is None else Binary("AND", out, e)
    return out


def map_children(node, f):
    if isinstance(node, Unary):
        return Unary(node.op, f(node.operand))
    if isinstance(node, Binary):
        return Binary(node.op, f(node.left), f(node.right))
    if isinstance(node, IsNull):
        return IsNull(f(node.operand), node.negated)
    if isinstance(node, InList):
        return InList(f(node.operand), tuple(f(i) for i in node.items), node.negated)
    if isinstance(node, Between):
        return Between(f(node.operand), f(node.low), f(node.high), node.negated)
    if isinstance(node, Like):
        return Like(f(node.operand), f(node.pattern), node.negated)
    if isinstance(node, Func):
        return Func(node.name, tuple(f(a) for a in node.args), node.star, node.distinct)
    return node


def children(node):
    out = []
    map_children(node, lambda c: out.append(c) or c)
    return out


def has_aggregate(node):
    if isinstance(node, Func) and node.name in AGGREGATES:
        return True
    return any(has_aggregate(c) for c in children(node))


# @id CODE-PLN-002 @implements REQ-PLN-007
def fold(node):
    node = map_children(node, fold)
    probe = children(node)
    if probe and all(isinstance(c, Literal) for c in probe):
        if isinstance(node, Func) and (node.name in AGGREGATES or node.star or node.distinct):
            return node
        try:
            return Literal(evaluate(node, Scope([]), ()))
        except EvalError:
            return node
    return node


def tables_of(node):
    if isinstance(node, Column):
        return {node.table.lower()} if node.table else set()
    return set().union(*(tables_of(c) for c in children(node)))


# @id CODE-PLN-003 @implements REQ-PLN-012
def fmt(node):
    if isinstance(node, Column):
        return f"{node.table}.{node.name}" if node.table else node.name
    if isinstance(node, Literal):
        v = node.value
        if v is None:
            return "NULL"
        if v is True:
            return "TRUE"
        if v is False:
            return "FALSE"
        if isinstance(v, str):
            return "'" + v.replace("'", "''") + "'"
        return repr(v)
    if isinstance(node, Unary):
        return f"(NOT {fmt(node.operand)})" if node.op == "NOT" else f"(-{fmt(node.operand)})"
    if isinstance(node, Binary):
        return f"({fmt(node.left)} {node.op} {fmt(node.right)})"
    if isinstance(node, IsNull):
        return f"({fmt(node.operand)} IS {'NOT ' if node.negated else ''}NULL)"
    if isinstance(node, InList):
        items = ", ".join(fmt(i) for i in node.items)
        return f"({fmt(node.operand)} {'NOT ' if node.negated else ''}IN ({items}))"
    if isinstance(node, Between):
        return (f"({fmt(node.operand)} {'NOT ' if node.negated else ''}BETWEEN "
                f"{fmt(node.low)} AND {fmt(node.high)})")
    if isinstance(node, Like):
        return f"({fmt(node.operand)} {'NOT ' if node.negated else ''}LIKE {fmt(node.pattern)})"
    if isinstance(node, Func):
        if node.star:
            return f"{node.name}(*)"
        inner = ", ".join(fmt(a) for a in node.args)
        return f"{node.name}({'DISTINCT ' if node.distinct else ''}{inner})"
    return repr(node)


def explain(node, depth=0):
    pad = "  " * depth
    if isinstance(node, OneRow):
        line = "OneRow"
    elif isinstance(node, Scan):
        line = f"Scan {node.table} AS {node.alias}"
    elif isinstance(node, Filter):
        line = f"Filter {fmt(node.pred)}"
    elif isinstance(node, Join):
        line = f"Join {node.kind}"
        if node.strategy == "hash":
            keys = " AND ".join(f"{fmt(l)} = {fmt(r)}" for l, r in node.keys)
            line += f" hash on {keys}"
            if node.residual is not None:
                line += f" residual {fmt(node.residual)}"
        elif node.strategy == "nested":
            line += f" nested on {fmt(node.cond) if node.cond is not None else 'TRUE'}"
    elif isinstance(node, Aggregate):
        keys = ", ".join(fmt(k) for k in node.group_keys)
        aggs = ", ".join(fmt(a) for a in node.aggs)
        line = f"Aggregate keys=[{keys}] aggs=[{aggs}]"
    elif isinstance(node, Sort):
        line = "Sort " + ", ".join(fmt(k.expr) + (" DESC" if k.desc else "") for k in node.keys)
    elif isinstance(node, Project):
        line = "Project " + ", ".join(f"{fmt(i.expr)} AS {i.alias}" for i in node.items)
    elif isinstance(node, Distinct):
        line = "Distinct"
    elif isinstance(node, Limit):
        line = f"Limit {node.limit} offset {node.offset or 0}"
    else:
        line = repr(node)
    return "\n".join([pad + line] + [explain(c, depth + 1) for c in node.children])


class _Binder:
    def __init__(self, select, catalog):
        self.select = select
        refs = ([select.from_] if select.from_ else []) + [j.table for j in select.joins]
        self.scans = []
        seen = set()
        for ref in refs:
            try:
                table = catalog.table(ref.name)
            except CatalogError as e:
                raise PlanError(str(e)) from None
            alias = ref.alias or table.name
            if alias.lower() in seen:
                raise PlanError(f"duplicate table alias {alias}")
            seen.add(alias.lower())
            self.scans.append(Scan(table.name, alias, tuple(c.name for c in table.columns)))
        self.scope = Scope([(s.alias, c) for s in self.scans for c in s.columns])

    # @id CODE-PLN-004 @implements REQ-PLN-002 @implements REQ-PLN-013
    def bind(self, node):
        if isinstance(node, Column):
            try:
                i = self.scope.resolve(node.table, node.name)
            except EvalError as e:
                raise PlanError(str(e)) from None
            t, n = self.scope.columns[i]
            return Column(t, n)
        return map_children(node, self.bind)

    # @id CODE-PLN-005 @implements REQ-PLN-010
    def select_items(self):
        out = []
        for item in self.select.items:
            e = item.expr
            if isinstance(e, Star):
                matched = [s for s in self.scans if e.table is None or s.alias.lower() == e.table.lower()]
                if not matched:
                    raise PlanError(f"unknown table {e.table} in {e.table}.*")
                for s in matched:
                    out.extend((Column(s.alias, c), c, False) for c in s.columns)
                continue
            bound = self.bind(e)
            if item.alias:
                name = item.alias
            elif isinstance(bound, Column):
                name = bound.name
            elif isinstance(bound, Func):
                name = bound.name.lower()
            else:
                name = "?column?"
            out.append((bound, name, item.alias is not None))
        return out

    # @id CODE-PLN-006 @implements REQ-PLN-011
    def order_keys(self, items):
        keys = []
        for o in self.select.order_by:
            e = o.expr
            if isinstance(e, Literal) and isinstance(e.value, int) and not isinstance(e.value, bool):
                if not 1 <= e.value <= len(items):
                    raise PlanError(f"ORDER BY position {e.value} is out of range")
                keys.append(OrderItem(items[e.value - 1][0], o.desc))
                continue
            if isinstance(e, Column) and e.table is None:
                hit = [x for x in items if x[2] and x[1].lower() == e.name.lower()]
                if hit:
                    keys.append(OrderItem(hit[0][0], o.desc))
                    continue
            keys.append(OrderItem(self.bind(e), o.desc))
        return keys


# @id CODE-PLN-007 @implements REQ-PLN-008 @implements REQ-FIX-001 @implements REQ-FIX-002
def _rewrite_grouped(node, group_keys, aggs):
    for i, g in enumerate(group_keys):
        if repr(node) == repr(g):
            return Column(None, f"$gk{i}")
    if isinstance(node, Func) and node.name in AGGREGATES:
        if any(has_aggregate(a) for a in node.args):
            raise PlanError("aggregate calls cannot be nested")
        keys = [repr(a) for a in aggs]
        if repr(node) not in keys:
            aggs.append(node)
            keys.append(repr(node))
        return Column(None, f"$agg{keys.index(repr(node))}")
    if isinstance(node, Column):
        label = f"{node.table}.{node.name}" if node.table else node.name
        raise PlanError(f"column {label} must appear in GROUP BY or inside an aggregate")
    return map_children(node, lambda c: _rewrite_grouped(c, group_keys, aggs))


# @id CODE-PLN-008 @implements REQ-PLN-001 @implements REQ-PLN-004 @implements REQ-PLN-005
# @implements REQ-PLN-006 @implements REQ-PLN-009
def _build_sources(binder, optimize):
    sel = binder.select
    scans = binder.scans
    if not scans:
        return OneRow(), [], []
    aliases = [s.alias.lower() for s in scans]
    nullable = {aliases[i + 1] for i, j in enumerate(sel.joins) if j.kind == "LEFT"}
    pool = [] if sel.where is None else _conjuncts(binder, sel.where, optimize)
    scan_filters = {a: [] for a in aliases}
    join_conds = [[] for _ in sel.joins]
    left_on = [[] for _ in sel.joins]
    top = []

    def place(c):
        n = tables_of(c)
        if not optimize or not n:
            top.append(c)
        elif len(n) == 1:
            t = next(iter(n))
            (top if t in nullable else scan_filters[t]).append(c)
        else:
            k = max(aliases.index(t) for t in n) - 1
            k = max(k, 0)
            if sel.joins[k].kind == "LEFT":
                top.append(c)
            else:
                join_conds[k].append(c)

    for c in pool:
        place(c)
    for k, j in enumerate(sel.joins):
        on = [] if j.on is None else _conjuncts(binder, j.on, optimize)
        if any(has_aggregate(c) for c in on):
            raise PlanError("aggregates are not allowed in ON")
        if j.kind == "LEFT":
            right = aliases[k + 1]
            for c in on:
                if optimize and tables_of(c) == {right}:
                    scan_filters[right].append(c)
                else:
                    left_on[k].append(c)
        else:
            for c in on:
                if optimize:
                    place(c)
                else:
                    join_conds[k].append(c)

    def leaf(i):
        s = scans[i]
        fs = scan_filters[aliases[i]]
        return Filter(conjoin(fs), s) if fs else s

    node = leaf(0)
    for k, j in enumerate(sel.joins):
        conds = left_on[k] if j.kind == "LEFT" else join_conds[k]
        cond = conjoin(conds)
        kind = j.kind
        if kind != "LEFT":
            kind = "INNER" if cond is not None else "CROSS"
        node = _make_join(kind, node, leaf(k + 1), cond, set(aliases[:k + 1]), aliases[k + 1])
    return node, top, scans


def _conjuncts(binder, expr, optimize):
    cs = split_conjuncts(_prep(binder, expr, optimize))
    if optimize:
        cs = [c for c in cs if not (isinstance(c, Literal) and c.value is True)]
    return cs


def _prep(binder, expr, optimize):
    if has_aggregate(expr):
        raise PlanError("aggregates are not allowed in WHERE or ON")
    bound = binder.bind(expr)
    return fold(bound) if optimize else bound


def _make_join(kind, left, right, cond, left_tables, right_alias):
    if kind == "CROSS":
        return Join("CROSS", left, right, None, "cross")
    keys, rest = [], []
    for c in split_conjuncts(cond):
        pair = None
        if isinstance(c, Binary) and c.op == "=":
            lt, rt = tables_of(c.left), tables_of(c.right)
            if lt and rt:
                if lt <= left_tables and rt == {right_alias}:
                    pair = (c.left, c.right)
                elif rt <= left_tables and lt == {right_alias}:
                    pair = (c.right, c.left)
        if pair:
            keys.append(pair)
        else:
            rest.append(c)
    if keys:
        return Join(kind, left, right, cond, "hash", tuple(keys), conjoin(rest))
    return Join(kind, left, right, cond, "nested", (), None)


# @id CODE-PLN-009 @implements REQ-PLN-001
def plan(select, catalog, optimize=True):
    binder = _Binder(select, catalog)
    items = binder.select_items()
    node, top, _ = _build_sources(binder, optimize)
    if top:
        node = Filter(conjoin(top), node)

    for g in select.group_by:
        if has_aggregate(g):
            raise PlanError("aggregates are not allowed in GROUP BY")
    group_keys = tuple(binder.bind(g) for g in select.group_by)
    having = None if select.having is None else binder.bind(select.having)
    order = binder.order_keys(items)
    out_items = [(e, n) for e, n, _ in items]
    if optimize:
        having = None if having is None else fold(having)
        out_items = [(fold(e), n) for e, n in out_items]
        order = [OrderItem(fold(o.expr), o.desc) for o in order]

    is_agg = (bool(group_keys) or having is not None
              or any(has_aggregate(e) for e, _ in out_items)
              or any(has_aggregate(o.expr) for o in order))
    if is_agg:
        aggs = []
        out_items = [(_rewrite_grouped(e, group_keys, aggs), n) for e, n in out_items]
        having = None if having is None else _rewrite_grouped(having, group_keys, aggs)
        order = [OrderItem(_rewrite_grouped(o.expr, group_keys, aggs), o.desc) for o in order]
        node = Aggregate(group_keys, tuple(aggs), node)
        if having is not None:
            node = Filter(having, node)
    if order:
        node = Sort(tuple(order), node)
    node = Project(tuple(SelectItem(e, n) for e, n in out_items), node)
    if select.distinct:
        node = Distinct(node)
    if select.limit is not None or select.offset is not None:
        node = Limit(select.limit, select.offset, node)
    return node
