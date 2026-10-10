from dataclasses import dataclass
import math
from types import MappingProxyType
from .encoding import choose_encoding, decode


@dataclass(frozen=True)
class Table:
    columns: object
    length: int
    block_size: int


# @id CODE-STO-001 @implements REQ-STO-001 REQ-STO-005
def build_table(columns, block_size=1024):
    columns = {name: tuple(values) for name, values in columns.items()}
    lengths = {len(values) for values in columns.values()}
    if not isinstance(block_size, int) or block_size <= 0 or len(lengths) > 1:
        raise ValueError("invalid table shape or block size")
    if any(not isinstance(name, str) or not name for name in columns):
        raise ValueError("invalid column name")
    return Table(MappingProxyType({name: choose_encoding(values) for name, values in columns.items()}),
                 next(iter(lengths), 0), block_size)


# @id CODE-STO-002 @implements REQ-STO-002
def scan(table, name, positions=None):
    values = decode(table.columns[name])
    return values if positions is None else [values[i] for i in positions]


# @id CODE-STO-003 @implements REQ-STO-003 REQ-STO-005
def append(table, columns):
    if set(columns) != set(table.columns):
        raise ValueError("append schema mismatch")
    addition = build_table(columns, table.block_size)
    return build_table({name: scan(table, name) + scan(addition, name) for name in table.columns}, table.block_size)


# @id CODE-STO-004 @implements REQ-STO-004
def snapshot(table):
    return table


# @id CODE-STO-006 @implements REQ-STO-006 REQ-STO-009
def zone_maps(table, name):
    values, maps = scan(table, name), []
    for start in range(0, table.length, table.block_size):
        block = values[start:start + table.block_size]
        nonnull = [v for v in block if v is not None]
        if any(type(v) is float and math.isnan(v) for v in nonnull):
            maps.append((float("nan"), float("nan"), len(block) - len(nonnull)))
            continue
        maps.append((min(nonnull) if nonnull else None, max(nonnull) if nonnull else None,
                     len(block) - len(nonnull)))
    return maps


# @id CODE-STO-007 @implements REQ-STO-007 REQ-STO-009
def prune(table, name, target):
    return [i for i, (low, high, nulls) in enumerate(zone_maps(table, name))
            if (nulls > 0 if target is None else low is not None and
                ((type(low) is float and math.isnan(low)) or low <= target <= high))]


# @id CODE-STO-008 @implements REQ-STO-008
def rows(table, positions=None):
    vectors = {name: scan(table, name) for name in table.columns}
    return [{name: values[i] for name, values in vectors.items()}
            for i in (range(table.length) if positions is None else positions)]
