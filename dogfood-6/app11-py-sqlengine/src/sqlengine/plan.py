from dataclasses import dataclass
from typing import Optional, Tuple


@dataclass(frozen=True)
class OneRow:
    @property
    def children(self):
        return ()


@dataclass(frozen=True)
class Scan:
    table: str
    alias: str
    columns: Tuple

    @property
    def children(self):
        return ()


@dataclass(frozen=True)
class Filter:
    pred: object
    child: object

    @property
    def children(self):
        return (self.child,)


@dataclass(frozen=True)
class Join:
    kind: str
    left: object
    right: object
    cond: Optional[object]
    strategy: str
    keys: Tuple = ()
    residual: Optional[object] = None

    @property
    def children(self):
        return (self.left, self.right)


@dataclass(frozen=True)
class Aggregate:
    group_keys: Tuple
    aggs: Tuple
    child: object

    @property
    def children(self):
        return (self.child,)


@dataclass(frozen=True)
class Sort:
    keys: Tuple
    child: object

    @property
    def children(self):
        return (self.child,)


@dataclass(frozen=True)
class Project:
    items: Tuple
    child: object

    @property
    def children(self):
        return (self.child,)


@dataclass(frozen=True)
class Distinct:
    child: object

    @property
    def children(self):
        return (self.child,)


@dataclass(frozen=True)
class Limit:
    limit: Optional[int]
    offset: Optional[int]
    child: object

    @property
    def children(self):
        return (self.child,)


def output_scope(node):
    """Ordered (table, column) pairs produced by a plan node."""
    if isinstance(node, OneRow):
        return []
    if isinstance(node, Scan):
        return [(node.alias, c) for c in node.columns]
    if isinstance(node, Join):
        return output_scope(node.left) + output_scope(node.right)
    if isinstance(node, Aggregate):
        return ([(None, f"$gk{i}") for i in range(len(node.group_keys))]
                + [(None, f"$agg{i}") for i in range(len(node.aggs))])
    if isinstance(node, Project):
        return [(None, item.alias) for item in node.items]
    return output_scope(node.child)
