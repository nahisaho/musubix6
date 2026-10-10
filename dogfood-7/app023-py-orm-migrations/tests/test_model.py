import pytest
from orm.model import Field, Model


# @id TEST-MODEL-001 @verifies REQ-MODEL-001
def test_model_001():
    class User(Model):
        id = Field(int, primary_key=True)
        name = Field(str)
    assert list(User.fields) == ["id", "name"]
    assert User.table == "user"


# @id TEST-MODEL-002 @verifies REQ-MODEL-002
def test_model_002():
    class Base(Model):
        id = Field(int, primary_key=True)
        title = Field(str)
    class Derived(Base):
        title = Field(int, default=3)
        extra = Field(str, default="x")
    assert list(Derived.fields) == ["id", "title", "extra"]
    assert Base.fields["title"].kind is str
    assert Derived().title == 3


# @id TEST-MODEL-003 @verifies REQ-MODEL-003
def test_model_003():
    calls = []
    class Item(Model):
        id = Field(int, primary_key=True)
        name = Field(str, default=lambda: str(len(calls.append(1) or calls)))
    assert (Item().name, Item().name) == ("1", "2")


# @id TEST-MODEL-004 @verifies REQ-MODEL-004
def test_model_004():
    class Item(Model):
        id = Field(int, primary_key=True)
        name = Field(str)
    with pytest.raises(ValueError, match="name"):
        Item(name=None)


# @id TEST-MODEL-005 @verifies REQ-MODEL-005
def test_model_005():
    class Item(Model):
        id = Field(int, primary_key=True)
        count = Field(int, default=0)
    item = Item()
    with pytest.raises(TypeError):
        item.count = True
    with pytest.raises(TypeError):
        item.count = "wrong"
    assert item.count == 0


# @id TEST-MODEL-006 @verifies REQ-MODEL-006
def test_model_006():
    class Item(Model):
        id = Field(int, primary_key=True)
    with pytest.raises(TypeError, match="unknown"):
        Item(unknown=1)


# @id TEST-MODEL-007 @verifies REQ-MODEL-007
def test_model_007():
    with pytest.raises(ValueError, match="primary"):
        class Invalid(Model):
            id = Field(int, primary_key=True)
            other = Field(int, primary_key=True)


# @id TEST-MODEL-008 @verifies REQ-MODEL-008
def test_model_008():
    class Item(Model):
        id = Field(int, primary_key=True)
        name = Field(str, default="safe")
    item = Item()
    serialized = item.to_dict()
    serialized["name"] = "mutated"
    assert item.to_dict() == {"id": None, "name": "safe"}


# @id TEST-MODEL-009 @verifies REQ-MODEL-009
def test_model_009():
    class Root(Model):
        id = Field(int, primary_key=True)
        value = Field(str, default="root")
    class Left(Root):
        pass
    class Right(Root):
        value = Field(int, default=7)
    class Diamond(Left, Right):
        pass
    assert Diamond.fields["value"] is Diamond.value
    assert Diamond().value == 7
    class Other(Root):
        value = Field(str, default="first")
    class Conflict(Other, Right):
        pass
    assert Conflict.fields["value"] is Conflict.value
    assert Conflict().value == "first"
