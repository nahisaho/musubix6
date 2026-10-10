import pytest
from hm.types import TVar, TCon, INT, BOOL, fn, pair, ftv, Subst
from hm.unify import unify, unify_all, UnifyError

a, b, c, d = TVar(0), TVar(1), TVar(2), TVar(3)


# @id TEST-UNIFY-001
# @verifies REQ-UNIFY-001
def test_unify_001_identical_gives_empty():
    assert len(unify(INT, INT)) == 0
    assert len(unify(fn(a, b), fn(a, b))) == 0
    assert len(unify(a, a)) == 0


# @id TEST-UNIFY-002
# @verifies REQ-UNIFY-002
def test_unify_002_bind_variable_either_side():
    assert unify(a, INT).apply(a) == INT
    assert unify(INT, a).apply(a) == INT
    s = unify(a, fn(b, c))
    assert s.apply(a) == fn(b, c)
    s2 = unify(fn(b, c), a)
    assert s2.apply(a) == fn(b, c)


# @id TEST-UNIFY-003
# @verifies REQ-UNIFY-003
def test_unify_003_occurs_check():
    with pytest.raises(UnifyError) as e:
        unify(a, fn(a, b))
    assert e.value.kind == "occurs"
    assert e.value.var == a and e.value.type == fn(a, b)
    with pytest.raises(UnifyError) as e:
        unify(pair(b, a), pair(INT, fn(INT, pair(a, INT))))
    assert e.value.kind == "occurs"
    # occurs through an already-bound variable
    with pytest.raises(UnifyError) as e:
        unify(fn(a, b), fn(b, fn(a, INT)))
    assert e.value.kind == "occurs"


# @id TEST-UNIFY-004
# @verifies REQ-UNIFY-004
def test_unify_004_threads_substitution():
    s = unify(fn(a, a), fn(b, INT))
    assert s.apply(a) == INT and s.apply(b) == INT
    s = unify(pair(a, fn(a, c)), pair(INT, fn(b, BOOL)))
    assert (s.apply(a), s.apply(b), s.apply(c)) == (INT, INT, BOOL)
    assert unify(TCon("List", (a,)), TCon("List", (INT,))).apply(a) == INT


# @id TEST-UNIFY-005
# @verifies REQ-UNIFY-005
def test_unify_005_mismatch():
    with pytest.raises(UnifyError) as e:
        unify(INT, BOOL)
    assert e.value.kind == "mismatch"
    assert (e.value.left, e.value.right) == (INT, BOOL)
    with pytest.raises(UnifyError) as e:
        unify(INT, fn(INT, INT))
    assert e.value.kind == "mismatch"
    with pytest.raises(UnifyError) as e:
        unify(TCon("T", (INT,)), TCon("T", (INT, INT)))
    assert e.value.kind == "mismatch"
    with pytest.raises(UnifyError) as e:
        unify(fn(a, a), fn(INT, BOOL))
    assert e.value.culprit == (INT, BOOL)


# @id TEST-UNIFY-006
# @verifies REQ-UNIFY-006
def test_unify_006_idempotent_and_equalising():
    cases = [
        (fn(a, fn(b, c)), fn(fn(c, d), fn(d, INT))),
        (pair(a, b), pair(b, c)),
        (fn(a, b), fn(b, a)),
        (fn(a, fn(b, c)), fn(b, fn(c, a))),
    ]
    for l, r in cases:
        s = unify(l, r)
        assert s.apply(l) == s.apply(r)
        for k, v in s.map.items():
            assert k not in ftv(s.apply(v))
        assert s.apply(s.apply(l)) == s.apply(l)


# @id TEST-UNIFY-007
# @verifies REQ-UNIFY-007
def test_unify_007_most_general():
    s = unify(a, fn(b, c))
    assert s.apply(b) == b and s.apply(c) == c
    s = unify(fn(a, b), fn(b, c))
    assert len({s.apply(a), s.apply(b), s.apply(c)}) == 1
    assert ftv(s.apply(a)) == {s.apply(a).id}
    s = unify(pair(a, b), pair(c, INT))
    assert s.apply(d) == d
    assert s.apply(b) == INT and s.apply(a) == s.apply(c)


# @id TEST-UNIFY-008
# @verifies REQ-UNIFY-008
def test_unify_008_unify_all_reports_index():
    s = unify_all([(a, INT), (b, fn(a, a))])
    assert s.apply(b) == fn(INT, INT)
    with pytest.raises(UnifyError) as e:
        unify_all([(a, INT), (b, BOOL), (a, BOOL), (c, INT)])
    assert e.value.index == 2
    assert e.value.culprit == (INT, BOOL)
    assert len(unify_all([])) == 0


# @id TEST-UNIFY-009
# @verifies REQ-UNIFY-009
def test_unify_009_outer_context_inner_culprit():
    outer_l, outer_r = fn(a, INT), fn(BOOL, BOOL)
    with pytest.raises(UnifyError) as e:
        unify(outer_l, outer_r)
    assert (e.value.left, e.value.right) == (outer_l, outer_r)
    assert e.value.culprit == (INT, BOOL)
    deep_l = pair(fn(INT, a), b)
    deep_r = pair(fn(INT, pair(INT, a)), a)
    with pytest.raises(UnifyError) as e:
        unify(deep_l, deep_r)
    assert e.value.kind == "occurs"
    assert (e.value.left, e.value.right) == (deep_l, deep_r)
