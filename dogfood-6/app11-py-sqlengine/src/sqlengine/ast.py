from dataclasses import dataclass
from typing import Optional, Tuple


@dataclass(frozen=True)
class Literal:
    value: object


@dataclass(frozen=True)
class Column:
    table: Optional[str]
    name: str


@dataclass(frozen=True)
class Unary:
    op: str
    operand: object


@dataclass(frozen=True)
class Binary:
    op: str
    left: object
    right: object


@dataclass(frozen=True)
class IsNull:
    operand: object
    negated: bool


@dataclass(frozen=True)
class InList:
    operand: object
    items: Tuple
    negated: bool


@dataclass(frozen=True)
class Between:
    operand: object
    low: object
    high: object
    negated: bool


@dataclass(frozen=True)
class Like:
    operand: object
    pattern: object
    negated: bool


@dataclass(frozen=True)
class Func:
    name: str
    args: Tuple
    star: bool = False
    distinct: bool = False


@dataclass(frozen=True)
class Star:
    table: Optional[str]


@dataclass(frozen=True)
class SelectItem:
    expr: object
    alias: Optional[str]


@dataclass(frozen=True)
class TableRef:
    name: str
    alias: Optional[str]


@dataclass(frozen=True)
class Join:
    kind: str
    table: TableRef
    on: Optional[object]


@dataclass(frozen=True)
class OrderItem:
    expr: object
    desc: bool


@dataclass(frozen=True)
class Select:
    items: Tuple
    from_: Optional[TableRef]
    joins: Tuple
    where: Optional[object]
    group_by: Tuple
    having: Optional[object]
    order_by: Tuple
    limit: Optional[int]
    offset: Optional[int]
    distinct: bool


@dataclass(frozen=True)
class ColumnDef:
    name: str
    type: str
    not_null: bool


@dataclass(frozen=True)
class CreateTable:
    name: str
    columns: Tuple


@dataclass(frozen=True)
class Insert:
    table: str
    rows: Tuple
