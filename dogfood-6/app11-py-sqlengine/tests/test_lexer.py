import pytest

from sqlengine.lexer import tokenize, LexError


def kinds(sql):
    return [(t.kind, t.value) for t in tokenize(sql)]


# @id TEST-LEX-001 @verifies REQ-LEX-001
def test_lex_001_keywords_uppercased():
    assert kinds("select From wHeRe")[:3] == [
        ("KEYWORD", "SELECT"), ("KEYWORD", "FROM"), ("KEYWORD", "WHERE")]


# @id TEST-LEX-002 @verifies REQ-LEX-002
def test_lex_002_identifiers():
    assert kinds('Foo "select" "a""b"')[:3] == [
        ("IDENT", "Foo"), ("IDENT", "select"), ("IDENT", 'a"b')]


# @id TEST-LEX-003 @verifies REQ-LEX-003
def test_lex_003_numbers():
    toks = tokenize("12 3.5 1e3 2.5E-1 .5")
    vals = [t.value for t in toks[:-1]]
    assert vals == [12, 3.5, 1000.0, 0.25, 0.5]
    assert [type(v) for v in vals] == [int, float, float, float, float]


# @id TEST-LEX-004 @verifies REQ-LEX-004
def test_lex_004_strings():
    assert kinds("'it''s' ''")[:2] == [("STRING", "it's"), ("STRING", "")]


# @id TEST-LEX-005 @verifies REQ-LEX-005
def test_lex_005_operators_longest_match():
    src = "= <> != < <= > >= + - * / % ||"
    vals = [t.value for t in tokenize(src)[:-1]]
    assert vals == ["=", "<>", "<>", "<", "<=", ">", ">=", "+", "-", "*", "/", "%", "||"]
    assert all(t.kind == "OP" for t in tokenize(src)[:-1])
    assert [t.value for t in tokenize("a<=b<>c")[:-1]] == ["a", "<=", "b", "<>", "c"]


# @id TEST-LEX-006 @verifies REQ-LEX-006
def test_lex_006_comments_whitespace():
    toks = tokenize("a -- c\n /* x\ny */ b-1")
    assert [t.value for t in toks[:-1]] == ["a", "b", "-", 1]


# @id TEST-LEX-007 @verifies REQ-LEX-007
@pytest.mark.parametrize("sql,pos", [("x 'abc", 2), ('x "abc', 2), ("x /* abc", 2)])
def test_lex_007_unterminated(sql, pos):
    with pytest.raises(LexError) as e:
        tokenize(sql)
    assert e.value.pos == pos


# @id TEST-LEX-008 @verifies REQ-LEX-008
def test_lex_008_bad_char():
    with pytest.raises(LexError) as e:
        tokenize("a @ b")
    assert e.value.pos == 2
    with pytest.raises(LexError):
        tokenize("a ! b")


# @id TEST-LEX-009 @verifies REQ-LEX-009
def test_lex_009_positions_and_eof():
    toks = tokenize("ab  , 'x'")
    assert [(t.kind, t.pos) for t in toks] == [("IDENT", 0), ("PUNCT", 4), ("STRING", 6), ("EOF", 9)]
    assert [t.kind for t in tokenize("")] == ["EOF"]
