import pytest
from hm.ast import Var, Lit, Lam, App, Let, If, Pair
from hm.parser import tokenize, parse, ParseError


def v(n):
    return Var(n)


def ap(f, *args):
    for a in args:
        f = App(f, a)
    return f


# @id TEST-PARSE-001
# @verifies REQ-PARSE-001
def test_parse_001_tokens_have_positions():
    toks = tokenize("foo 12\n  true")
    got = [(t.kind, t.text, t.line, t.col) for t in toks if t.kind != "eof"]
    assert got == [("ident", "foo", 1, 1), ("int", "12", 1, 5), ("bool", "true", 2, 3)]


# @id TEST-PARSE-002
# @verifies REQ-PARSE-002
def test_parse_002_lambda_sugar():
    expected = Lam("x", Lam("y", v("x")))
    assert parse("\\x y. x") == expected
    assert parse("fun x y -> x") == expected
    assert parse("\\x. \\y. x y") == Lam("x", Lam("y", ap(v("x"), v("y"))))


# @id TEST-PARSE-003
# @verifies REQ-PARSE-003
def test_parse_003_application_left_assoc():
    assert parse("f a b c") == ap(v("f"), v("a"), v("b"), v("c"))
    assert parse("f (g a) b") == ap(v("f"), ap(v("g"), v("a")), v("b"))


# @id TEST-PARSE-004
# @verifies REQ-PARSE-004
def test_parse_004_operator_precedence():
    def op(o, a, b):
        return ap(v(o), a, b)

    one, two, three = Lit(1), Lit(2), Lit(3)
    assert parse("1 + 2 * 3") == op("+", one, op("*", two, three))
    assert parse("1 - 2 - 3") == op("-", op("-", one, two), three)
    assert parse("1 + 2 < 3 * 3") == op("<", op("+", one, two), op("*", three, three))
    assert parse("f 1 + g 2") == op("+", ap(v("f"), one), ap(v("g"), two))
    with pytest.raises(ParseError):
        parse("1 < 2 < 3")


# @id TEST-PARSE-005
# @verifies REQ-PARSE-005
def test_parse_005_let_and_letrec():
    assert parse("let x = 1 in x") == Let("x", Lit(1), v("x"), False)
    assert parse("let rec f = \\n. f n in f 1") == Let(
        "f", Lam("n", ap(v("f"), v("n"))), ap(v("f"), Lit(1)), True
    )
    assert parse("let a = let b = 1 in b in a") == Let(
        "a", Let("b", Lit(1), v("b"), False), v("a"), False
    )
    assert parse("if true then 1 else 2") == If(Lit(True), Lit(1), Lit(2))


# @id TEST-PARSE-006
# @verifies REQ-PARSE-006
def test_parse_006_pairs_and_grouping():
    assert parse("(1, true)") == Pair(Lit(1), Lit(True))
    assert parse("(1, (2, 3))") == Pair(Lit(1), Pair(Lit(2), Lit(3)))
    assert parse("((x))") == v("x")
    with pytest.raises(ParseError):
        parse("(1, 2, 3)")


# @id TEST-PARSE-007
# @verifies REQ-PARSE-007
def test_parse_007_comments():
    assert parse("1 -- one\n") == Lit(1)
    assert parse("f -- c\n  x") == ap(v("f"), v("x"))
    assert parse("1 - 2") == ap(v("-"), Lit(1), Lit(2))


# @id TEST-PARSE-008
# @verifies REQ-PARSE-008
def test_parse_008_bad_token_position():
    with pytest.raises(ParseError) as e:
        parse("let x = 1 in\n  x $ 2")
    assert (e.value.line, e.value.col) == (2, 5)
    with pytest.raises(ParseError) as e:
        parse("1 + in")
    assert (e.value.line, e.value.col) == (1, 5)


# @id TEST-PARSE-009
# @verifies REQ-PARSE-009
def test_parse_009_eof_and_trailing():
    with pytest.raises(ParseError) as e:
        parse("let x = 1 in")
    assert (e.value.line, e.value.col) == (1, 13)
    with pytest.raises(ParseError) as e:
        parse("(1 + 2")
    assert (e.value.line, e.value.col) == (1, 7)
    with pytest.raises(ParseError) as e:
        parse("1 2 )")
    assert (e.value.line, e.value.col) == (1, 5)
    with pytest.raises(ParseError):
        parse("")


# @id TEST-PARSE-010
# @verifies REQ-PARSE-010
def test_parse_010_keyword_binder():
    for src in ["\\in. in", "let if = 1 in 2", "fun then -> 1", "let rec let = 1 in 2"]:
        with pytest.raises(ParseError):
            parse(src)


# @id TEST-PARSE-011
# @verifies REQ-PARSE-011
def test_parse_011_depth_limit_is_a_parse_error():
    with pytest.raises(ParseError) as e:
        parse("(" * 500 + "1" + ")" * 500)
    assert "too deep" in e.value.msg and e.value.line == 1
    with pytest.raises(ParseError):
        parse("\\x. " * 400 + "x")
    with pytest.raises(ParseError):
        parse("if true then " * 300 + "1")
    assert parse("(" * 90 + "1" + ")" * 90) == Lit(1)
