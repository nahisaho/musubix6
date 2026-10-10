import sqlite3
import pytest
from orm.model import Field, Model
from orm.migration import Column, Schema, Plan, diff


def user_schema():
    return Schema({"user": (Column("id", "INTEGER", True, True), Column("name", "TEXT", True))})


# @id TEST-MIGRATION-001 @verifies REQ-MIGRATION-001
def test_migration_001():
    class User(Model):
        id = Field(int, primary_key=True)
        name = Field(str, nullable=True)
    assert Schema.from_models([User]) == user_schema()


# @id TEST-MIGRATION-002 @verifies REQ-MIGRATION-002
def test_migration_002():
    plan = diff(Schema({}), user_schema())
    assert plan.statements == ('CREATE TABLE "user" ("id" INTEGER PRIMARY KEY, "name" TEXT)',)
    assert not plan.destructive


# @id TEST-MIGRATION-003 @verifies REQ-MIGRATION-003
def test_migration_003():
    old = user_schema()
    new = Schema({"user": old.tables["user"] + (Column("age", "INTEGER", True),)})
    assert diff(old, new).statements == ('ALTER TABLE "user" ADD COLUMN "age" INTEGER',)


# @id TEST-MIGRATION-004 @verifies REQ-MIGRATION-004
def test_migration_004():
    plan = diff(user_schema(), Schema({}))
    assert plan.destructive
    connection = sqlite3.connect(":memory:")
    with pytest.raises(PermissionError):
        plan.apply(connection)


# @id TEST-MIGRATION-005 @verifies REQ-MIGRATION-005
def test_migration_005():
    old = user_schema()
    for columns in [(Column("id", "INTEGER", True, True),),
                    (Column("id", "INTEGER", True, True), Column("name", "INTEGER", True))]:
        with pytest.raises(ValueError, match="rebuild"):
            diff(old, Schema({"user": columns}))


# @id TEST-MIGRATION-006 @verifies REQ-MIGRATION-006
def test_migration_006():
    assert diff(user_schema(), user_schema()).statements == ()


# @id TEST-MIGRATION-007 @verifies REQ-MIGRATION-007
def test_migration_007():
    connection = sqlite3.connect(":memory:")
    diff(Schema({}), user_schema()).apply(connection)
    assert [r[1] for r in connection.execute("PRAGMA table_info(user)")] == ["id", "name"]
    broken = Plan(('CREATE TABLE extra(id INTEGER)', 'INVALID SQL'), False)
    with pytest.raises(sqlite3.OperationalError):
        broken.apply(connection)
    assert connection.execute("SELECT name FROM sqlite_master WHERE name='extra'").fetchall() == []


# @id TEST-MIGRATION-008 @verifies REQ-MIGRATION-008
def test_migration_008():
    old = user_schema()
    new = Schema({"user": old.tables["user"] + (Column("required", "TEXT", False),)})
    with pytest.raises(ValueError, match="NOT NULL"):
        diff(old, new)


# @id TEST-MIGRATION-009 @verifies REQ-MIGRATION-009
def test_migration_009():
    connection = sqlite3.connect(":memory:", autocommit=True)
    diff(Schema({}), user_schema()).apply(connection)
    assert not connection.in_transaction
    assert [row[1] for row in connection.execute("PRAGMA table_info(user)")] == ["id", "name"]
    broken = Plan(('CREATE TABLE extra(id INTEGER)', 'INVALID SQL'), False)
    with pytest.raises(sqlite3.OperationalError):
        broken.apply(connection)
    assert not connection.in_transaction
    assert connection.execute("SELECT name FROM sqlite_master WHERE name='extra'").fetchall() == []
