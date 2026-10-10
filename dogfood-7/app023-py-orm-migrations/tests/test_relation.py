import sqlite3
import pytest
from orm.model import Field, Model
from orm.work import Session
from orm.relation import Relationship


def setup():
    class Parent(Model):
        id = Field(int, primary_key=True)
        name = Field(str)
    class Child(Model):
        id = Field(int, primary_key=True)
        parent_id = Field(int, nullable=True)
    connection = sqlite3.connect(":memory:")
    connection.executescript(
        "CREATE TABLE parent(id INTEGER PRIMARY KEY, name TEXT);"
        "CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER);"
        "INSERT INTO parent VALUES(1,'a'),(2,'b'),(3,'c');"
        "INSERT INTO child VALUES(1,1),(2,1),(3,2),(4,NULL),(5,99);")
    session = Session(connection)
    return session, Parent, Child, Relationship(session, Parent, Child, "parent_id")


# @id TEST-RELATION-001 @verifies REQ-RELATION-001
def test_relation_001():
    session, _, Child, rel = setup()
    child = session.get(Child, 1)
    assert rel.parent(child).name == "a"
    count = session.select_count
    assert rel.parent(child).name == "a"
    assert session.select_count == count


# @id TEST-RELATION-002 @verifies REQ-RELATION-002
def test_relation_002():
    session, _, Child, rel = setup()
    child = session.get(Child, 4)
    count = session.select_count
    assert rel.parent(child) is None
    assert session.select_count == count


# @id TEST-RELATION-003 @verifies REQ-RELATION-003
def test_relation_003():
    session, Parent, _, rel = setup()
    assert [c.id for c in rel.children(session.get(Parent, 1))] == [1, 2]


# @id TEST-RELATION-004 @verifies REQ-RELATION-004
def test_relation_004():
    session, _, Child, rel = setup()
    children = [session.get(Child, i) for i in (1, 2, 3, 4)]
    count = session.select_count
    rel.prefetch_parents(children)
    assert session.select_count == count + 1
    assert [rel.parent(c).id if rel.parent(c) else None for c in children] == [1, 1, 2, None]
    assert session.select_count == count + 1


# @id TEST-RELATION-005 @verifies REQ-RELATION-005
def test_relation_005():
    session, _, Child, rel = setup()
    child = session.get(Child, 5)
    assert rel.parent(child) is None
    count = session.select_count
    assert rel.parent(child) is None
    assert session.select_count == count


# @id TEST-RELATION-006 @verifies REQ-RELATION-006
def test_relation_006():
    session, Parent, Child, _ = setup()
    with pytest.raises(ValueError):
        Relationship(session, Parent, Child, "missing")


# @id TEST-RELATION-007 @verifies REQ-RELATION-007
def test_relation_007():
    session, Parent, Child, rel = setup()
    parent = session.get(Parent, 1)
    assert rel.parent(session.get(Child, 1)) is parent


# @id TEST-RELATION-008 @verifies REQ-RELATION-008
def test_relation_008():
    session, Parent, _, rel = setup()
    parents = [session.get(Parent, i) for i in (1, 2, 3)]
    count = session.select_count
    grouped = rel.prefetch_children(parents)
    assert [[c.id for c in grouped[p.id]] for p in parents] == [[1, 2], [3], []]
    assert session.select_count == count + 1


# @id TEST-RELATION-009 @verifies REQ-RELATION-009
def test_relation_009():
    session, Parent, Child, rel = setup()
    foreign = Session(session.connection)
    child = foreign.get(Child, 1)
    parent = foreign.get(Parent, 1)
    for load in [lambda: rel.parent(child), lambda: rel.children(parent),
                 lambda: rel.prefetch_parents([child]), lambda: rel.prefetch_children([parent])]:
        with pytest.raises(ValueError, match="session"):
            load()


# @id TEST-RELATION-010 @verifies REQ-RELATION-010
def test_relation_010():
    session, _, Child, rel = setup()
    child = session.get(Child, 1)
    assert rel.parent(child).id == 1
    child.parent_id = 2
    assert rel.parent(child).id == 2
    child.parent_id = None
    assert rel.parent(child) is None
    child.parent_id = 1
    assert rel.parent(child).id == 1
    orphan = session.get(Child, 5)
    assert rel.parent(orphan) is None
    orphan.parent_id = 2
    assert rel.parent(orphan).id == 2


# @id TEST-RELATION-011 @verifies REQ-RELATION-011
def test_relation_011():
    session, Parent, Child, rel = setup()
    parent = session.get(Parent, 1)
    child = session.get(Child, 1)
    for dirty in (2, None):
        child.parent_id = dirty
        count = session.select_count
        grouped = rel.prefetch_children([parent])
        assert [obj.id for obj in grouped[1]] == [1, 2]
        assert grouped[1][0] is child
        assert child.parent_id == dirty
        assert session.select_count == count + 1
