from dataclasses import dataclass

from .errors import SqlError

TYPES = ("INT", "FLOAT", "TEXT", "BOOL")


class CatalogError(SqlError):
    pass


@dataclass(frozen=True)
class Column:
    name: str
    type: str
    not_null: bool = False


def _coerce(col, value):
    if value is None:
        if col.not_null:
            raise CatalogError(f"column {col.name} is NOT NULL")
        return None
    if col.type == "INT" and isinstance(value, int) and not isinstance(value, bool):
        return value
    if col.type == "FLOAT" and isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if col.type == "TEXT" and isinstance(value, str):
        return value
    if col.type == "BOOL" and isinstance(value, bool):
        return value
    raise CatalogError(f"column {col.name} expects {col.type}, got {value!r}")


class Table:
    def __init__(self, name, columns):
        self.name = name
        self.columns = tuple(columns)
        self.rows = []

    # @id CODE-CAT-001 @implements REQ-CAT-001
    def column_index(self, name):
        for i, c in enumerate(self.columns):
            if c.name.lower() == name.lower():
                return i
        raise CatalogError(f"unknown column {name} in table {self.name}")

    # @id CODE-CAT-002 @implements REQ-CAT-003 @implements REQ-CAT-004 @implements REQ-CAT-005
    def insert(self, rows):
        staged = []
        for row in rows:
            if len(row) != len(self.columns):
                raise CatalogError(
                    f"table {self.name} has {len(self.columns)} columns, got {len(row)} values")
            staged.append(tuple(_coerce(c, v) for c, v in zip(self.columns, row)))
        self.rows.extend(staged)


class Catalog:
    def __init__(self):
        self._tables = {}

    # @id CODE-CAT-003 @implements REQ-CAT-001 @implements REQ-CAT-002
    def create_table(self, name, columns):
        key = name.lower()
        if key in self._tables:
            raise CatalogError(f"table {name} already exists")
        if not columns:
            raise CatalogError("a table needs at least one column")
        seen = set()
        for c in columns:
            if c.type not in TYPES:
                raise CatalogError(f"unknown type {c.type}")
            if c.name.lower() in seen:
                raise CatalogError(f"duplicate column {c.name}")
            seen.add(c.name.lower())
        table = Table(name, columns)
        self._tables[key] = table
        return table

    def table(self, name):
        try:
            return self._tables[name.lower()]
        except KeyError:
            raise CatalogError(f"unknown table {name}") from None
