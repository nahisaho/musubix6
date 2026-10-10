from copy import deepcopy
from dataclasses import dataclass
from types import MappingProxyType
from .storage import rows, scan, prune
from .operators import OPCODES, AGGREGATES, predicate, select, project, group_by, sort_rows, limit
from .joins import hash_join, left_join, semi_join, anti_join, choose_join


# @id CODE-PLAN-006 @implements REQ-PLAN-006
class Catalog:
    def __init__(self, tables):
        self.tables = MappingProxyType(dict(tables))


@dataclass(frozen=True)
class Plan:
    query: object
    nodes: tuple
    blocks: tuple
    estimated_rows: int


# @id CODE-PLAN-010 @implements REQ-PLAN-010
def freeze(value):
    if isinstance(value, dict):
        return MappingProxyType({k: freeze(v) for k, v in value.items()})
    if isinstance(value, (list, tuple)):
        return tuple(freeze(v) for v in value)
    return value


def thaw(value):
    if isinstance(value, MappingProxyType):
        return {k: thaw(v) for k, v in value.items()}
    if isinstance(value, tuple):
        return tuple(thaw(v) for v in value)
    return value


# @id CODE-PLAN-007 @implements REQ-PLAN-007 REQ-PLAN-009
def validate(catalog, query):
    try:
        return validate_shape(catalog, query)
    except (TypeError, KeyError, AttributeError, IndexError) as error:
        raise ValueError("malformed query field") from error


def sequence(value):
    if not isinstance(value, (list, tuple)):
        raise ValueError("expected sequence")
    return value


# @id CODE-PLAN-011 @implements REQ-PLAN-011
def validate_target(table, column, op, target):
    accepted = (type(None), bool, int, float, str, bytes)
    if type(target) not in accepted:
        raise ValueError("unsupported filter target")
    if target is None or op == "isnull":
        return
    numeric = (bool, int, float)
    for value in scan(table, column):
        if value is not None and not (type(value) is type(target) or
                                     type(value) in numeric and type(target) in numeric):
            raise ValueError("incompatible filter target")


def validate_shape(catalog, query):
    allowed = {"table", "filters", "project", "sort", "limit", "join", "group", "aggregates"}
    if not isinstance(query, dict) or set(query) - allowed or query.get("table") not in catalog.tables:
        raise ValueError("invalid query or table")
    columns = set(catalog.tables[query["table"]].columns)
    for item in sequence(query.get("filters", [])):
        if not isinstance(item, (list, tuple)) or len(item) != 3 or item[0] not in columns or item[1] not in set(OPCODES) | {"isnull"}:
            raise ValueError("invalid filter")
        validate_target(catalog.tables[query["table"]], *item)
    if "join" in query:
        join = query["join"]
        if not isinstance(join, dict):
            raise ValueError("expected join mapping")
        if set(join) != {"table", "left", "right", "how"} or join["table"] not in catalog.tables or join["how"] not in {"inner", "left", "semi", "anti"}:
            raise ValueError("invalid join")
        right = set(catalog.tables[join["table"]].columns)
        if not sequence(join["left"]) or len(join["left"]) != len(sequence(join["right"])) or set(join["left"]) - columns or set(join["right"]) - right:
            raise ValueError("invalid join keys")
        if join["how"] in {"inner", "left"}:
            columns = {"l." + c for c in columns} | {"r." + c for c in right}
    if ("group" in query) != ("aggregates" in query):
        raise ValueError("group and aggregates required together")
    if "group" in query:
        if set(sequence(query["group"])) - columns or not isinstance(query["aggregates"], dict):
            raise ValueError("unknown group column")
        for alias, item in query["aggregates"].items():
            if not isinstance(alias, str) or alias in query["group"] or len(sequence(item)) != 2 or item[0] not in AGGREGATES or item[1] not in columns:
                raise ValueError("invalid aggregate")
        columns = set(query["group"]) | set(query["aggregates"])
    if "project" in query and set(sequence(query["project"])) - columns:
        raise ValueError("unknown projection")
    if "sort" in query and (len(sequence(query["sort"])) != 2 or query["sort"][0] not in columns or not isinstance(query["sort"][1], bool)):
        raise ValueError("invalid sort")
    if "limit" in query:
        if len(sequence(query["limit"])) != 2:
            raise ValueError("invalid limit")
        limit([], *query["limit"])


def selected_blocks(table, filters):
    blocks = set(range((table.length + table.block_size - 1) // table.block_size))
    for column, op, target in filters:
        if op == "eq":
            blocks &= set(prune(table, column, target))
    return tuple(sorted(blocks))


def block_positions(table, blocks):
    return [i for block in blocks
            for i in range(block * table.block_size, min((block + 1) * table.block_size, table.length))]


# @id CODE-PLAN-001 @implements REQ-PLAN-001 REQ-PLAN-004
def plan(catalog, query):
    validate(catalog, query)
    query = deepcopy(query)
    table = catalog.tables[query["table"]]
    blocks = selected_blocks(table, query.get("filters", []))
    cardinality = estimate(catalog, query)
    nodes = [{"op": "scan", "table": query["table"], "estimated_rows": table.length}]
    nodes.extend({"op": "filter", "predicate": tuple(f)} for f in query.get("filters", []))
    if "join" in query:
        join = query["join"]
        nodes.append({"op": "join", **choose_join(cardinality, catalog.tables[join["table"]].length)})
    for op in ("group", "sort", "project", "limit"):
        if op in query:
            nodes.append({"op": op})
    return Plan(freeze(query), tuple(freeze(n) for n in nodes), blocks, cardinality)


# @id CODE-PLAN-002 @implements REQ-PLAN-002 REQ-PLAN-004 REQ-PLAN-008
def execute(catalog, physical):
    query = physical.query
    table = catalog.tables[query["table"]]
    positions = block_positions(table, physical.blocks)
    for column, op, target in query.get("filters", []):
        positions = select(scan(table, column), op, target, positions)
    data = rows(table, positions)
    if "join" in query:
        join = query["join"]
        right = catalog.tables[join["table"]]
        fn = {"inner": hash_join, "left": left_join, "semi": semi_join, "anti": anti_join}[join["how"]]
        args = (data, rows(right), join["left"], join["right"])
        data = fn(*args, right_columns=right.columns) if join["how"] == "left" else fn(*args)
    if "group" in query:
        data = group_by(data, query["group"], query["aggregates"])
    if "sort" in query:
        data = sort_rows(data, *query["sort"])
    if "project" in query:
        data = project(data, query["project"])
    if "limit" in query:
        data = limit(data, *query["limit"])
    return data


# @id CODE-PLAN-003 @implements REQ-PLAN-003
def explain(physical):
    return {"nodes": [thaw(n) for n in physical.nodes], "blocks": list(physical.blocks),
            "estimated_rows": physical.estimated_rows}


# @id CODE-PLAN-005 @implements REQ-PLAN-005
def estimate(catalog, query):
    validate(catalog, query)
    table = catalog.tables[query["table"]]
    filters = query.get("filters", [])
    blocks = selected_blocks(table, filters)
    upper = sum(min(table.block_size, table.length - b * table.block_size) for b in blocks)
    return upper if not filters else min(upper, max(1, upper // (2 ** len(filters)))) if upper else 0


# @id CODE-PLAN-008 @implements REQ-PLAN-008
def execute_batch(catalog, queries):
    plans = [plan(catalog, q) for q in queries]
    return [execute(catalog, p) for p in plans]
