from dataclasses import dataclass
from types import MappingProxyType
from orm.model import identifier


# @id CODE-MIGRATION-001 @implements REQ-MIGRATION-001
@dataclass(frozen=True)
class Column:
    name: str
    kind: str
    nullable: bool = False
    primary_key: bool = False
    default: str | int | float | None = None

    def __post_init__(self):
        identifier(self.name)
        if self.kind not in ("INTEGER", "TEXT", "REAL", "BLOB"):
            raise ValueError("unsupported SQL type")
        if self.primary_key and self.kind != "INTEGER":
            raise ValueError("primary key must be INTEGER")
        if self.default is not None and type(self.default) not in (str, int, float):
            raise ValueError("unsupported SQL default")

    def sql(self):
        value = f"{identifier(self.name)} {self.kind}"
        if self.primary_key:
            value += " PRIMARY KEY"
        elif not self.nullable:
            value += " NOT NULL"
        if self.default is not None:
            value += " DEFAULT " + (
                "'" + self.default.replace("'", "''") + "'" if isinstance(self.default, str)
                else str(self.default))
        return value


@dataclass(frozen=True)
class Schema:
    tables: object

    def __post_init__(self):
        copied = {}
        for name, columns in self.tables.items():
            identifier(name)
            columns = tuple(columns)
            if len({column.name for column in columns}) != len(columns):
                raise ValueError("duplicate column")
            if not columns or sum(column.primary_key for column in columns) != 1:
                raise ValueError("table requires exactly one primary key")
            copied[name] = columns
        object.__setattr__(self, "tables", MappingProxyType(copied))

    @classmethod
    def from_models(cls, models):
        kinds = {int: "INTEGER", str: "TEXT", float: "REAL", bytes: "BLOB"}
        tables = {}
        for model in models:
            if model.table in tables:
                raise ValueError("duplicate table")
            tables[model.table] = tuple(
                Column(name, kinds[field.kind], field.nullable, field.primary_key)
                for name, field in model.fields.items())
        return cls(tables)


# @id CODE-MIGRATION-002 @implements REQ-MIGRATION-004 REQ-MIGRATION-007 REQ-MIGRATION-009
@dataclass(frozen=True)
class Plan:
    statements: tuple
    destructive: bool = False

    def __post_init__(self):
        object.__setattr__(self, "statements", tuple(self.statements))

    def apply(self, connection, *, allow_destructive=False):
        if self.destructive and not allow_destructive:
            raise PermissionError("destructive migration requires explicit permission")
        if connection.in_transaction:
            raise RuntimeError("external database transaction")
        try:
            connection.execute("BEGIN")
            for statement in self.statements:
                connection.execute(statement)
            connection.execute("COMMIT")
        except BaseException:
            if connection.in_transaction:
                connection.execute("ROLLBACK")
            raise


# @id CODE-MIGRATION-003 @implements REQ-MIGRATION-002 REQ-MIGRATION-003 REQ-MIGRATION-005 REQ-MIGRATION-006 REQ-MIGRATION-008
def diff(old, new):
    statements = []
    removed = old.tables.keys() - new.tables.keys()
    for table in sorted(removed):
        statements.append(f"DROP TABLE {identifier(table)}")
    for table in sorted(new.tables):
        if table not in old.tables:
            definitions = ", ".join(column.sql() for column in new.tables[table])
            statements.append(f"CREATE TABLE {identifier(table)} ({definitions})")
            continue
        before = {column.name: column for column in old.tables[table]}
        after = {column.name: column for column in new.tables[table]}
        if before.keys() - after.keys() or any(after[name] != column for name, column in before.items()):
            raise ValueError("schema change requires unsupported table rebuild")
        for column in new.tables[table]:
            if column.name not in before:
                if column.primary_key:
                    raise ValueError("primary key addition requires rebuild")
                if not column.nullable and column.default is None:
                    raise ValueError("NOT NULL addition requires a default")
                statements.append(f"ALTER TABLE {identifier(table)} ADD COLUMN {column.sql()}")
    return Plan(tuple(statements), bool(removed))
