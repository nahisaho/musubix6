import operator


OPCODES = {"eq": operator.eq, "ne": operator.ne, "lt": operator.lt,
           "le": operator.le, "gt": operator.gt, "ge": operator.ge}
AGGREGATES = {"sum", "min", "max", "avg", "count", "count_all"}


# @id CODE-OPS-001 @implements REQ-OPS-001
def select(values, op, target=None, positions=None):
    return [i for i in (range(len(values)) if positions is None else positions)
            if predicate(values[i], op, target)]


# @id CODE-OPS-002 @implements REQ-OPS-002
def project(data, columns, positions=None):
    return [{name: data[i][name] for name in columns}
            for i in (range(len(data)) if positions is None else positions)]


# @id CODE-OPS-003 @implements REQ-OPS-003
def predicate(value, op, target=None):
    if op == "isnull":
        return value is None
    if op not in OPCODES:
        raise ValueError("unknown predicate")
    if op not in ("eq", "ne") and (value is None or target is None):
        return False
    return OPCODES[op](value, target)


# @id CODE-OPS-004 @implements REQ-OPS-004
def aggregate(values, op):
    values = list(values)
    if op not in AGGREGATES:
        raise ValueError("unknown aggregate")
    nonnull = [v for v in values if v is not None]
    if op == "count_all":
        return len(values)
    if op == "count":
        return len(nonnull)
    if op == "sum":
        return sum(nonnull)
    if not nonnull:
        return None
    return {"min": min, "max": max, "avg": lambda xs: sum(xs) / len(xs)}[op](nonnull)


# @id CODE-OPS-005 @implements REQ-OPS-005
def group_by(data, keys, aggregates):
    groups = {}
    for row in data:
        groups.setdefault(tuple(row[k] for k in keys), []).append(row)
    if not keys and not groups:
        groups[()] = []
    return [dict(zip(keys, key), **{alias: aggregate((r[column] for r in members), op)
                                  for alias, (op, column) in aggregates.items()})
            for key, members in groups.items()]


# @id CODE-OPS-006 @implements REQ-OPS-006
def sort_rows(data, key, descending=False):
    present = [r for r in data if r[key] is not None]
    nulls = [r for r in data if r[key] is None]
    return sorted(present, key=lambda r: r[key], reverse=descending) + nulls


# @id CODE-OPS-007 @implements REQ-OPS-007
def limit(data, count, offset=0):
    if not isinstance(count, int) or not isinstance(offset, int) or count < 0 or offset < 0:
        raise ValueError("invalid limit")
    return data[offset:offset + count]


# @id CODE-OPS-008 @implements REQ-OPS-008
def distinct(data, keys):
    seen, result = set(), []
    for row in data:
        key = tuple(row[k] for k in keys)
        if key not in seen:
            seen.add(key)
            result.append(row)
    return result
