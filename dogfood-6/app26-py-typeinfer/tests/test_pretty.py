import random
from hm.ast import Var, Lit, Lam, App, Let, If, Pair
from hm.parser import parse
from hm.types import TVar, TCon, INT, BOOL, fn, pair, Scheme
from hm.pretty import show_type, show_scheme, show_expr, Namer

a, b, c = TVar(0), TVar(1), TVar(2)


# @id TEST-PRETTY-001
# @verifies REQ-PRETTY-001
def test_pretty_001_names_by_first_appearance():
    assert show_type(INT) == "Int" and show_type(BOOL) == "Bool"
    assert show_type(fn(INT, BOOL)) == "Int -> Bool"
    assert show_type(TVar(7)) == "a"
    assert show_type(fn(TVar(9), TVar(3))) == "a -> b"
    assert show_type(fn(TVar(3), fn(TVar(9), TVar(3)))) == "a -> b -> a"


# @id TEST-PRETTY-002
# @verifies REQ-PRETTY-002
def test_pretty_002_arrow_assoc():
    assert show_type(fn(fn(a, b), c)) == "(a -> b) -> c"
    assert show_type(fn(a, fn(b, c))) == "a -> b -> c"
    assert show_type(fn(fn(fn(a, a), a), a)) == "((a -> a) -> a) -> a"
    assert show_type(fn(a, fn(fn(b, c), a))) == "a -> (b -> c) -> a"


# @id TEST-PRETTY-003
# @verifies REQ-PRETTY-003
def test_pretty_003_pairs():
    assert show_type(pair(INT, BOOL)) == "Int * Bool"
    assert show_type(pair(fn(a, b), c)) == "(a -> b) * c"
    assert show_type(fn(a, pair(b, c))) == "a -> b * c"
    assert show_type(pair(pair(a, b), c)) == "(a * b) * c"
    assert show_type(pair(a, pair(b, c))) == "a * b * c"
    assert show_type(pair(a, fn(b, c))) == "a * (b -> c)"
    assert show_type(TCon("List", (fn(a, b),))) == "List (a -> b)"


# @id TEST-PRETTY-004
# @verifies REQ-PRETTY-004
def test_pretty_004_many_variables():
    t = TVar(29)
    for i in range(28, -1, -1):
        t = fn(TVar(i), t)
    names = show_type(t).split(" -> ")
    assert len(names) == 30 and len(set(names)) == 30
    assert names[25] == "z" and names[26] == "a1" and names[27] == "b1"
    assert names[29] == "d1"


# @id TEST-PRETTY-005
# @verifies REQ-PRETTY-005
def test_pretty_005_schemes():
    assert show_scheme(Scheme((0, 1), fn(a, b))) == "forall a b. a -> b"
    assert show_scheme(Scheme((), INT)) == "Int"
    assert show_scheme(Scheme((3,), fn(TVar(3), TVar(3)))) == "forall a. a -> a"
    assert show_scheme(Scheme((5, 2), fn(TVar(2), TVar(5)))) == "forall a b. a -> b"
    assert show_scheme(Scheme((1,), fn(b, c))) == "forall a. a -> b"
    assert show_scheme(Scheme((9,), INT)) == "Int"


def rand_expr(rng, depth):
    names = ["x", "y", "f", "g", "z1"]
    ops = ["+", "-", "*", "<", "=="]
    if depth == 0 or rng.random() < 0.15:
        k = rng.randrange(3)
        return [Var(rng.choice(names)), Lit(rng.randrange(0, 50)), Lit(rng.random() < .5)][k]
    k = rng.randrange(7)
    d = depth - 1
    if k == 0:
        return Lam(rng.choice(names), rand_expr(rng, d))
    if k == 1:
        return App(rand_expr(rng, d), rand_expr(rng, d))
    if k == 2:
        return Let(rng.choice(names), rand_expr(rng, d), rand_expr(rng, d), rng.random() < .3)
    if k == 3:
        return If(rand_expr(rng, d), rand_expr(rng, d), rand_expr(rng, d))
    if k == 4:
        return Pair(rand_expr(rng, d), rand_expr(rng, d))
    return App(App(Var(rng.choice(ops)), rand_expr(rng, d)), rand_expr(rng, d))


# @id TEST-PRETTY-006
# @verifies REQ-PRETTY-006
def test_pretty_006_expression_round_trip():
    assert show_expr(parse("\\x y. x y")) == "\\x y. x y"
    assert show_expr(parse("1 + 2 * 3")) == "1 + 2 * 3"
    assert show_expr(parse("(1 + 2) * 3")) == "(1 + 2) * 3"
    assert show_expr(parse("1 - (2 - 3)")) == "1 - (2 - 3)"
    assert show_expr(parse("f (g x) (\\y. y)")) == "f (g x) (\\y. y)"
    assert show_expr(parse("(\\x. x) 1")) == "(\\x. x) 1"
    assert show_expr(parse("(1 < 2) == true")) == "(1 < 2) == true"
    assert show_expr(parse("let rec f = \\n. n in (f 1, f 2)")) == "let rec f = \\n. n in (f 1, f 2)"
    assert show_expr(parse("(let x = 1 in x) + 1")) == "(let x = 1 in x) + 1"
    assert show_expr(parse("f (if true then 1 else 2)")) == "f (if true then 1 else 2)"
    rng = random.Random(1234)
    for _ in range(300):
        e = rand_expr(rng, 5)
        txt = show_expr(e)
        assert parse(txt) == e, txt


# @id TEST-PRETTY-007
# @verifies REQ-PRETTY-007
def test_pretty_007_shared_namer():
    n = Namer()
    assert show_type(fn(a, b), n) == "a -> b"
    assert show_type(fn(b, c), n) == "b -> c"
    assert show_type(TVar(2), n) == "c"
    assert show_type(fn(a, b)) == "a -> b"
    assert show_type(fn(b, c)) == "a -> b"


def rand_type(rng, depth, nvars):
    if depth == 0 or rng.random() < 0.25:
        return rng.choice([INT, BOOL, TVar(rng.randrange(nvars))])
    d = depth - 1
    k = rng.randrange(2)
    mk = fn if k == 0 else pair
    return mk(rand_type(rng, d, nvars), rand_type(rng, d, nvars))


def rename(t, m):
    if isinstance(t, TVar):
        return TVar(m[t.id])
    return TCon(t.name, tuple(rename(x, m) for x in t.args))


# @id TEST-PRETTY-008
# @verifies REQ-PRETTY-008
def test_pretty_008_alpha_equivalent_types_print_equal():
    rng = random.Random(7)
    for _ in range(200):
        t = rand_type(rng, 4, 6)
        perm = list(range(100, 106))
        rng.shuffle(perm)
        t2 = rename(t, dict(enumerate(perm)))
        assert show_type(t) == show_type(t2)
    assert show_type(fn(a, b)) != show_type(fn(a, a))
