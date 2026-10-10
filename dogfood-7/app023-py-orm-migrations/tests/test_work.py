import sqlite3
import pytest
from orm.model import Field, Model
from orm.work import Session


def setup():
    class User(Model):
        id = Field(int, primary_key=True)
        name = Field(str)
    connection = sqlite3.connect(":memory:")
    connection.execute("CREATE TABLE user(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)")
    connection.execute("INSERT INTO user(name) VALUES ('a')")
    connection.commit()
    return connection, Session(connection), User


# @id TEST-WORK-001 @verifies REQ-WORK-001
def test_work_001():
    _, session, User = setup()
    first = session.get(User, 1)
    count = session.select_count
    assert session.get(User, 1) is first
    assert session.select_count == count


# @id TEST-WORK-002 @verifies REQ-WORK-002
def test_work_002():
    connection, session, User = setup()
    user = User(name="b")
    session.add(user)
    session.commit()
    assert user.id == 2
    assert session.get(User, 2) is user
    assert connection.execute("SELECT name FROM user WHERE id=2").fetchone() == ("b",)


# @id TEST-WORK-003 @verifies REQ-WORK-003
def test_work_003():
    connection, session, User = setup()
    user = session.get(User, 1)
    user.name = "changed"
    session.commit()
    assert connection.execute("SELECT name FROM user").fetchone()[0] == "changed"


# @id TEST-WORK-004 @verifies REQ-WORK-004
def test_work_004():
    connection, session, User = setup()
    user = session.get(User, 1)
    session.delete(user)
    session.commit()
    assert session.get(User, 1) is None
    assert connection.execute("SELECT count(*) FROM user").fetchone()[0] == 0


# @id TEST-WORK-005 @verifies REQ-WORK-005
def test_work_005():
    connection, session, User = setup()
    one, duplicate = User(name="b"), User(name="a")
    session.add(one)
    session.add(duplicate)
    with pytest.raises(sqlite3.IntegrityError):
        session.commit()
    assert one.id is duplicate.id is None
    assert connection.execute("SELECT count(*) FROM user").fetchone()[0] == 1
    assert session.get(User, 2) is None


# @id TEST-WORK-006 @verifies REQ-WORK-006
def test_work_006():
    connection, session, User = setup()
    other = Session(connection)
    assert session.get(User, 1) is not other.get(User, 1)


# @id TEST-WORK-007 @verifies REQ-WORK-007
def test_work_007():
    connection, session, User = setup()
    user = session.get(User, 1)
    with pytest.raises(RuntimeError):
        with session.transaction():
            user.name = "changed"
            raise RuntimeError("abort")
    assert user.name == "a"
    assert connection.execute("SELECT name FROM user").fetchone()[0] == "a"


# @id TEST-WORK-008 @verifies REQ-WORK-008
def test_work_008():
    connection, session, User = setup()
    with session.transaction():
        session.add(User(name="b"))
        with pytest.raises(RuntimeError, match="nested"):
            with session.transaction():
                pass
        assert connection.execute("SELECT count(*) FROM user").fetchone()[0] == 1
    assert connection.execute("SELECT count(*) FROM user").fetchone()[0] == 2


# @id TEST-WORK-009 @verifies REQ-WORK-009
def test_work_009():
    connection, session, User = setup()
    statements = []
    connection.set_trace_callback(statements.append)
    with session.transaction():
        session.add(User(name="b"))
        with pytest.raises(RuntimeError, match="context"):
            session.commit()
        assert not any(s.startswith(("INSERT", "UPDATE", "DELETE")) for s in statements)
        assert connection.execute("SELECT count(*) FROM user").fetchone()[0] == 1
    assert connection.execute("SELECT count(*) FROM user").fetchone()[0] == 2


# @id TEST-WORK-010 @verifies REQ-WORK-010
def test_work_010():
    connection, session, User = setup()
    user = User(name="b")
    session.add(user)
    session.add(user)
    assert session.pending == [user]
    session.commit()
    session.add(user)
    assert session.pending == []
    session.commit()
    assert connection.execute("SELECT count(*) FROM user").fetchone()[0] == 2


# @id TEST-WORK-011 @verifies REQ-WORK-011
def test_work_011():
    class User(Model):
        id = Field(int, primary_key=True)
        name = Field(str)
    connection = sqlite3.connect(":memory:", autocommit=True)
    connection.execute("CREATE TABLE user(id INTEGER PRIMARY KEY, name TEXT UNIQUE)")
    session = Session(connection)
    one = User(name="a")
    session.add(one)
    session.commit()
    assert not connection.in_transaction
    good, bad = User(name="b"), User(name="a")
    session.add(good)
    session.add(bad)
    with pytest.raises(sqlite3.IntegrityError):
        session.commit()
    assert not connection.in_transaction
    assert good.id is bad.id is None
    assert connection.execute("SELECT count(*) FROM user").fetchone()[0] == 1
