import pytest
from hm.ast import Var
from hm.types import (TVar, INT, BOOL, fn, pair, Scheme, TypeEnv, Supply, ftv)
from hm.infer import infer_program, infer_expr, initial_env, InferError

t0, t1, t2 = TVar(0), TVar(1), TVar(2)


def ty(src):
    return infer_program(src)


def err(src):
    with pytest.raises(InferError) as e:
        infer_program(src)
    return e.value


# @id TEST-INFER-001
# @verifies REQ-INFER-001
def test_infer_001_literals():
    assert ty("1") == Scheme((), INT)
    assert ty("true") == Scheme((), BOOL)
    assert ty("false") == Scheme((), BOOL)
    assert ty("0") == Scheme((), INT)


# @id TEST-INFER-002
# @verifies REQ-INFER-002
def test_infer_002_variables_instantiate():
    env = TypeEnv({"k": Scheme((0,), fn(TVar(0), TVar(0)))})
    sup = Supply(5)
    s, t = infer_expr(Var("k"), env, sup)
    assert len(s) == 0
    assert t.name == "->" and t.args[0] == t.args[1] and t.args[0] != TVar(0)
    s2, t2_ = infer_expr(Var("k"), env, sup)
    assert t2_ != t
    assert ty("let id = \\x. x in (id 1, id true)") == Scheme((), pair(INT, BOOL))


# @id TEST-INFER-003
# @verifies REQ-INFER-003
def test_infer_003_unbound():
    e = err("x")
    assert (e.kind, e.pos, e.name) == ("unbound", (1, 1), "x")
    e = err("\\y. y + z")
    assert (e.kind, e.pos, e.name) == ("unbound", (1, 9), "z")
    e = err("let x = 1 in\n  y")
    assert e.pos == (2, 3)
    e = err("let a = a in a")
    assert e.kind == "unbound" and e.pos == (1, 9)
    e = err("\\x. let rec f = g in f")
    assert e.name == "g"


# @id TEST-INFER-004
# @verifies REQ-INFER-004
def test_infer_004_lambda():
    assert ty("\\x. x") == Scheme((0,), fn(t0, t0))
    assert ty("\\x y. x") == Scheme((0, 1), fn(t0, fn(t1, t0)))
    assert ty("\\x. 1") == Scheme((0,), fn(t0, INT))
    assert ty("\\x. \\x. x") == Scheme((0, 1), fn(t0, fn(t1, t1)))  # shadowing


# @id TEST-INFER-005
# @verifies REQ-INFER-005
def test_infer_005_application():
    assert ty("(\\x. x) 1") == Scheme((), INT)
    assert ty("\\f x. f x") == Scheme((0, 1), fn(fn(t0, t1), fn(t0, t1)))
    assert ty("\\f x. f (f x)") == Scheme((0,), fn(fn(t0, t0), fn(t0, t0)))
    assert ty("\\f g x. f (g x)") == Scheme(
        (0, 1, 2), fn(fn(t0, t1), fn(fn(t2, t0), fn(t2, t1))))
    assert ty("\\x. \\y. x") == Scheme((0, 1), fn(t0, fn(t1, t0)))


# @id TEST-INFER-006
# @verifies REQ-INFER-006
def test_infer_006_let_generalizes():
    assert ty("let f = \\x. x in (f 1, f true)") == Scheme((), pair(INT, BOOL))
    assert ty("let x = 1 in x") == Scheme((), INT)
    assert ty("\\y. let g = \\x. y in g") == Scheme((0, 1), fn(t0, fn(t1, t0)))
    # env must be substituted before computing its free variables
    assert ty("\\x. let y = x 1 in y 1") == Scheme((0,), fn(fn(INT, fn(INT, t0)), t0))
    assert ty("let k = \\a b. a in let c = k 1 in (c true, c 2)") == Scheme(
        (), pair(INT, INT))


# @id TEST-INFER-007
# @verifies REQ-INFER-007
def test_infer_007_lambda_bound_is_monomorphic():
    e = err("\\f. (f 1, f true)")
    assert e.kind == "mismatch" and e.pos == (1, 13)
    assert (e.expected, e.actual) == (INT, BOOL)
    e = err("\\f. let g = f in (g 1, g true)")
    assert e.kind == "mismatch"
    assert ty("let f = \\x. x in \\y. (f y, f true)").vars == (0,)


# @id TEST-INFER-008
# @verifies REQ-INFER-008
def test_infer_008_let_rec():
    src = "let rec f = \\n. if n < 1 then 0 else f (n - 1) in f"
    assert ty(src) == Scheme((), fn(INT, INT))
    assert ty("let rec id = \\x. x in (id 1, id true)") == Scheme((), pair(INT, BOOL))
    assert err("let rec f = \\x. (f 1, f true) in f").kind == "mismatch"
    assert err("let rec f = \\x. f in f").kind == "occurs"
    assert err("let f = \\n. f n in f").kind == "unbound"
    fact = "let rec fact = \\n. if n == 0 then 1 else n * fact (n - 1) in fact"
    assert ty(fact) == Scheme((), fn(INT, INT))


# @id TEST-INFER-009
# @verifies REQ-INFER-009
def test_infer_009_if():
    assert ty("if true then 1 else 2") == Scheme((), INT)
    e = err("if 1 then 2 else 3")
    assert (e.kind, e.pos, e.expected, e.actual) == ("mismatch", (1, 4), BOOL, INT)
    e = err("if true then 1 else false")
    assert (e.pos, e.expected, e.actual) == ((1, 21), INT, BOOL)
    assert ty("\\a b. if true then a else b") == Scheme((0,), fn(t0, fn(t0, t0)))
    assert ty("\\c. if c then 1 else 2") == Scheme((), fn(BOOL, INT))


# @id TEST-INFER-010
# @verifies REQ-INFER-010
def test_infer_010_pairs():
    assert ty("(1, true)") == Scheme((), pair(INT, BOOL))
    assert ty("fst (1, true)") == Scheme((), INT)
    assert ty("snd (1, true)") == Scheme((), BOOL)
    assert ty("\\p. fst p") == Scheme((0, 1), fn(pair(t0, t1), t0))
    assert ty("\\p. (snd p, fst p)") == Scheme((0, 1), fn(pair(t0, t1), pair(t1, t0)))
    assert err("fst 1").kind == "mismatch"
    assert "fst" in initial_env() and "snd" in initial_env()


# @id TEST-INFER-011
# @verifies REQ-INFER-011
def test_infer_011_operators():
    assert ty("1 + 2 * 3 - 4") == Scheme((), INT)
    assert ty("1 < 2") == Scheme((), BOOL)
    assert ty("1 == 1") == Scheme((), BOOL)
    assert ty("true == false") == Scheme((), BOOL)
    assert ty("\\x. x == x") == Scheme((0,), fn(t0, BOOL))
    assert err("1 == true").kind == "mismatch"
    assert err("true + 1").kind == "mismatch"
    assert err("1 + 2 < true").kind == "mismatch"


# @id TEST-INFER-012
# @verifies REQ-INFER-012
def test_infer_012_error_details():
    e = err("1 + true")
    assert (e.kind, e.pos, e.expected, e.actual) == ("mismatch", (1, 5), INT, BOOL)
    e = err("1 2")
    assert (e.kind, e.pos, e.actual) == ("mismatch", (1, 1), INT)
    assert e.expected.name == "->"
    e = err("let f = \\x. x + 1 in f true")
    assert (e.pos, e.expected, e.actual) == ((1, 24), INT, BOOL)
    assert isinstance(e, Exception) and e.args


# @id TEST-INFER-013
# @verifies REQ-INFER-013
def test_infer_013_canonical_principal_type():
    assert ty("\\x y. y") == Scheme((0, 1), fn(t0, fn(t1, t1)))
    assert ty("\\y x. x") == ty("\\x y. y")
    assert ty("let a = \\x. x in a") == Scheme((0,), fn(t0, t0))
    sc = ty("\\f g x. f (g x)")
    assert sc.vars == (0, 1, 2) and ftv(sc.body) == {0, 1, 2}
    assert ty("1").vars == ()


# @id TEST-INFER-014
# @verifies REQ-INFER-014
def test_infer_014_self_application():
    e = err("\\x. x x")
    assert (e.kind, e.pos) == ("occurs", (1, 5))
    assert err("let w = \\x. x x in w").kind == "occurs"
    assert err("\\f. f f 1").kind == "occurs"
    assert ty("\\x. x") .vars == (0,)
