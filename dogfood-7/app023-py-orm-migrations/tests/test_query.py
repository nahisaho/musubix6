import sqlite3
import pytest
from orm.model import Field, Model
from orm.query import Query


def user_model():
    class User(Model):
        id = Field(int, primary_key=True)
        name = Field(str, nullable=True)
    return User


# @id TEST-QUERY-001 @verifies REQ-QUERY-001
def test_query_001():
    assert Query(user_model()).compile() == ('SELECT "id", "name" FROM "user"', ())


# @id TEST-QUERY-002 @verifies REQ-QUERY-002
def test_query_002():
    payload = "' OR 1=1 --"
    sql, params = Query(user_model()).where(name=payload).compile()
    assert payload not in sql
    assert params == (payload,)


# @id TEST-QUERY-003 @verifies REQ-QUERY-003
def test_query_003():
    query = Query(user_model())
    for kwargs in [{"missing": 1}, {"name__raw": "DROP"}, {"name;DROP": 1}]:
        with pytest.raises(ValueError):
            query.where(**kwargs)


# @id TEST-QUERY-004 @verifies REQ-QUERY-004
def test_query_004():
    query = Query(user_model())
    assert query.order_by("-name").limit(2).compile() == (
        'SELECT "id", "name" FROM "user" ORDER BY "name" DESC LIMIT ?', (2,))
    for value in [-1, True, 1.5]:
        with pytest.raises(ValueError):
            query.limit(value)
    with pytest.raises(ValueError):
        query.order_by("nope")


# @id TEST-QUERY-005 @verifies REQ-QUERY-005
def test_query_005():
    query = Query(user_model())
    assert query.where(name=None).compile()[0].endswith('"name" IS NULL')
    assert query.where(name__ne=None).compile()[0].endswith('"name" IS NOT NULL')
    assert query.where(name=None).compile()[1] == ()


# @id TEST-QUERY-006 @verifies REQ-QUERY-006
def test_query_006():
    connection = sqlite3.connect(":memory:")
    connection.execute("CREATE TABLE user(id INTEGER, name TEXT)")
    connection.execute("INSERT INTO user VALUES (1, 'a')")
    sql, params = Query(user_model()).where(id__in=[]).compile()
    assert connection.execute(sql, params).fetchall() == []


# @id TEST-QUERY-007 @verifies REQ-QUERY-007
def test_query_007():
    base = Query(user_model())
    derived = base.where(id=3).order_by("id").limit(1)
    assert base.compile()[1] == ()
    assert "WHERE" not in base.compile()[0]
    assert derived.compile()[1] == (3, 1)


# @id TEST-QUERY-008 @verifies REQ-QUERY-008
def test_query_008():
    sql, params = Query(user_model()).where(id__gt=2, name__ne="x").where(id__lt=9).compile()
    assert sql.endswith('"id" > ? AND "name" != ? AND "id" < ?')
    assert params == (2, "x", 9)
