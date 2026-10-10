import pytest
from hm.types import (TVar, TCon, INT, BOOL, fn, pair, ftv, Subst, Scheme,
                      TypeEnv, generalize, instantiate, Supply)

a, b, c = TVar(0), TVar(1), TVar(2)


# @id TEST-TYPES-001
# @verifies REQ-TYPES-001
def test_types_001_structural_equality():
    assert TVar(1) == TVar(1) and TVar(1) != TVar(2)
    assert fn(INT, a) == TCon("->", (INT, a))
    assert pair(INT, BOOL) == TCon("*", (INT, BOOL))
    assert hash(fn(a, b)) == hash(fn(TVar(0), TVar(1)))
    assert len({INT, TCon("Int"), BOOL}) == 2
    assert INT != TVar(0) and TCon("Int") != TCon("Int", (INT,))


# @id TEST-TYPES-002
# @verifies REQ-TYPES-002
def test_types_002_ftv():
    assert ftv(INT) == set()
    assert ftv(fn(a, pair(b, fn(a, c)))) == {0, 1, 2}
    assert ftv(Scheme((0,), fn(a, b))) == {1}


# @id TEST-TYPES-003
# @verifies REQ-TYPES-003
def test_types_003_apply_is_transitive_and_idempotent():
    s = Subst({0: b, 1: INT})
    assert s.apply(a) == INT
    t = fn(a, pair(b, c))
    assert s.apply(t) == fn(INT, pair(INT, c))
    assert s.apply(s.apply(t)) == s.apply(t)
    assert Subst().apply(t) == t
    with pytest.raises(ValueError):
        Subst({0: fn(a, a)}).apply(a)


# @id TEST-TYPES-004
# @verifies REQ-TYPES-004
def test_types_004_compose_order():
    s1 = Subst({1: INT})
    s2 = Subst({0: fn(b, c)})
    s12 = s1.compose(s2)
    t = fn(a, b)
    assert s12.apply(t) == s1.apply(s2.apply(t))
    assert s12.apply(a) == fn(INT, c)
    s3 = Subst({0: BOOL})
    assert Subst({0: INT}).compose(s3).apply(a) == BOOL
    assert s3.compose(Subst({0: INT})).apply(a) == INT


# @id TEST-TYPES-005
# @verifies REQ-TYPES-005
def test_types_005_generalize():
    env = TypeEnv({"x": Scheme((), a), "y": Scheme((2,), fn(b, c))})
    sc = generalize(env, fn(a, fn(b, c)))
    assert sc.vars == (2,)  # c is only quantified inside the env entry y
    assert generalize(TypeEnv(), fn(a, fn(b, a))).vars == (0, 1)
    assert generalize(TypeEnv(), INT) == Scheme((), INT)
    sc2 = generalize(TypeEnv({"x": Scheme((), a)}), fn(a, b))
    assert sc2.vars == (1,)


# @id TEST-TYPES-006
# @verifies REQ-TYPES-006
def test_types_006_instantiate_fresh_and_consistent():
    sup = Supply(10)
    sc = Scheme((0, 1), fn(a, fn(b, fn(a, c))))
    t1 = instantiate(sc, sup)
    t2 = instantiate(sc, sup)
    x, y = t1.args[0], t1.args[1].args[0]
    assert t1 == fn(x, fn(y, fn(x, c)))
    assert x != y and x != c and y != c
    assert ftv(t1) & ftv(t2) == {2}


# @id TEST-TYPES-007
# @verifies REQ-TYPES-007
def test_types_007_subst_respects_quantifier():
    sc = Scheme((0,), fn(a, b))
    out = Subst({0: INT, 1: BOOL}).apply_scheme(sc)
    assert out == Scheme((0,), fn(a, BOOL))
    env = TypeEnv({"f": sc})
    assert Subst({1: INT}).apply_env(env)["f"] == Scheme((0,), fn(a, INT))
    # capture avoidance: replacement mentions the quantified id
    out2 = Subst({1: a}).apply_scheme(sc)
    assert out2.vars != (0,) or out2.body != fn(a, a)
    assert len(ftv(out2)) == 1


# @id TEST-TYPES-008
# @verifies REQ-TYPES-008
def test_types_008_supply():
    s = Supply()
    ids = [s.fresh().id for _ in range(3)]
    assert ids == [0, 1, 2]
    s.reserve(fn(TVar(40), TVar(7)))
    assert s.fresh().id == 41
    s.reserve(INT)
    s.reserve(TVar(3))
    assert s.fresh().id == 42


# @id TEST-TYPES-009
# @verifies REQ-TYPES-009
def test_types_009_instantiate_with_overlapping_supply():
    sc = Scheme((0, 1), fn(a, fn(b, a)))
    t = instantiate(sc, Supply(1))
    assert t == fn(TVar(1), fn(TVar(2), TVar(1)))
    t = instantiate(Scheme((0,), fn(a, a)), Supply(0))
    assert t == fn(TVar(0), TVar(0))
    t = instantiate(Scheme((0, 1), fn(a, b)), Supply(1))
    assert ftv(t) == {1, 2}
