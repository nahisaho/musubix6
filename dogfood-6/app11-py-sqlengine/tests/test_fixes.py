from sqlengine.engine import Engine


def make():
    e = Engine()
    e.execute("CREATE TABLE t (a INT)")
    e.execute("INSERT INTO t VALUES (1),(2)")
    return e


# @id TEST-FIX-001 @verifies REQ-FIX-001
def test_fix_001_agg_literal_types_distinct():
    row = make().execute("SELECT SUM(1), SUM(1.0) FROM t").rows[0]
    assert [type(v) for v in row] == [int, float]
    assert row == (2, 2.0)


# @id TEST-FIX-002 @verifies REQ-FIX-002
def test_fix_002_group_key_literal_not_substituted():
    row = make().execute("SELECT TRUE, COUNT(*) FROM t GROUP BY 1").rows[0]
    assert type(row[0]) is bool and row[0] is True
    assert row[1] == 2
