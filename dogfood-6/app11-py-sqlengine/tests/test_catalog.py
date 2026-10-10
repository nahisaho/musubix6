import pytest

from sqlengine.catalog import Catalog, CatalogError, Column


def make():
    cat = Catalog()
    cat.create_table("People", [Column("id", "INT", True), Column("Name", "TEXT", False),
                                Column("score", "FLOAT", False), Column("ok", "BOOL", False)])
    return cat


# @id TEST-CAT-001 @verifies REQ-CAT-001
def test_cat_001_create_and_lookup():
    cat = make()
    t = cat.table("pEoPle")
    assert t.name == "People"
    assert [(c.name, c.type) for c in t.columns] == [
        ("id", "INT"), ("Name", "TEXT"), ("score", "FLOAT"), ("ok", "BOOL")]
    assert t.rows == []
    assert t.column_index("NAME") == 1
    with pytest.raises(CatalogError):
        cat.table("nope")
    with pytest.raises(CatalogError):
        t.column_index("zzz")


# @id TEST-CAT-002 @verifies REQ-CAT-002
def test_cat_002_create_errors():
    cat = make()
    with pytest.raises(CatalogError):
        cat.create_table("PEOPLE", [Column("a", "INT", False)])
    with pytest.raises(CatalogError):
        cat.create_table("t", [Column("a", "INT", False), Column("A", "TEXT", False)])
    with pytest.raises(CatalogError):
        cat.create_table("t", [Column("a", "DATE", False)])
    with pytest.raises(CatalogError):
        cat.create_table("t", [])
    with pytest.raises(CatalogError):
        cat.table("t")


# @id TEST-CAT-003 @verifies REQ-CAT-003
def test_cat_003_coercion_and_null():
    t = make().table("people")
    t.insert([(1, "a", 3, True), (2, None, None, None)])
    assert t.rows == [(1, "a", 3.0, True), (2, None, None, None)]
    assert isinstance(t.rows[0][2], float)


# @id TEST-CAT-004 @verifies REQ-CAT-004
@pytest.mark.parametrize("row", [
    ("x", "a", 1.0, True),
    (True, "a", 1.0, True),
    (1, 5, 1.0, True),
    (1, "a", "s", True),
    (1, "a", 1.0, 1),
    (1, "a", 1.0),
    (1, "a", 1.0, True, 9),
])
def test_cat_004_type_and_arity(row):
    t = make().table("people")
    with pytest.raises(CatalogError):
        t.insert([row])
    assert t.rows == []


# @id TEST-CAT-005 @verifies REQ-CAT-005
def test_cat_005_not_null_atomic():
    t = make().table("people")
    t.insert([(1, "a", None, None)])
    with pytest.raises(CatalogError):
        t.insert([(2, "b", None, None), (None, "c", None, None)])
    assert t.rows == [(1, "a", None, None)]
