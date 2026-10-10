from dataclasses import dataclass, field

from .catalog import Catalog, Column
from .ast import CreateTable, Insert, Select
from .executor import Context, execute_plan
from .expr import Scope, evaluate
from .parser import parse
from .plan import Distinct, Limit, Project
from .planner import plan


@dataclass
class Result:
    columns: list = field(default_factory=list)
    rows: list = field(default_factory=list)
    rowcount: int = 0


# @id CODE-EXE-006 @implements REQ-EXE-001 @implements REQ-EXE-014 @implements REQ-EXE-015
class Engine:
    def __init__(self, optimize=True, join_strategy=None):
        self.catalog = Catalog()
        self.optimize = optimize
        self.join_strategy = join_strategy

    def execute(self, sql):
        stmt = parse(sql)
        if isinstance(stmt, CreateTable):
            self.catalog.create_table(
                stmt.name, [Column(c.name, c.type, c.not_null) for c in stmt.columns])
            return Result()
        if isinstance(stmt, Insert):
            table = self.catalog.table(stmt.table)
            scope = Scope([])
            rows = [tuple(evaluate(e, scope, ()) for e in row) for row in stmt.rows]
            table.insert(rows)
            return Result(rowcount=len(rows))
        node = plan(stmt, self.catalog, optimize=self.optimize)
        rows = execute_plan(node, Context(self.catalog, self.join_strategy))
        top = node
        while isinstance(top, (Limit, Distinct)):
            top = top.child
        assert isinstance(top, Project)
        return Result([i.alias for i in top.items], rows, len(rows))
