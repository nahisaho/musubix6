from smt.terms import Term
from smt.euf import closure


def terms():
    return Term("a"), Term("b"), Term("c")


# @id TEST-EUF-001 @verifies REQ-EUF-001
def test_euf_001():
    a = Term("a")
    assert closure([(a, a)], []).equal(a, a)


# @id TEST-EUF-002 @verifies REQ-EUF-002
def test_euf_002():
    a, b, _ = terms()
    assert closure([(a, b)], []).equal(b, a)


# @id TEST-EUF-003 @verifies REQ-EUF-003
def test_euf_003():
    a, b, c = terms()
    assert closure([(a, b), (b, c)], []).equal(a, c)


# @id TEST-EUF-004 @verifies REQ-EUF-004
def test_euf_004():
    a, b, _ = terms()
    assert closure([(a, b)], [(Term("f", (a,)), Term("f", (b,)))]) is None


# @id TEST-EUF-005 @verifies REQ-EUF-005
def test_euf_005():
    a, b, c = terms()
    assert closure([(a, b), (b, c)], [(a, c)]) is None


# @id TEST-EUF-006 @verifies REQ-EUF-006
def test_euf_006():
    a, b, _ = terms()
    pairs = [(Term("f", (a,)), Term("g", (a,))),
             (Term("f", (a,)), Term("f", (a, b)))]
    assert closure([], pairs) is not None
    assert closure([(Term("f", (a,)), Term("f", (b,)))], [(a, b)]) is not None


# @id TEST-EUF-007 @verifies REQ-EUF-007
def test_euf_007():
    a, b, _ = terms()
    ga = Term("g", (Term("f", (a,)),))
    gb = Term("g", (Term("f", (b,)),))
    assert closure([(a, b)], [(ga, gb)]) is None


# @id TEST-EUF-008 @verifies REQ-EUF-008
def test_euf_008():
    a, b, _ = terms()
    fa, fb = Term("f", (a,)), Term("f", (b,))
    model = closure([(a, b), (fa, fb)], [])
    assert model.classes[a] == model.classes[b]
    assert model.functions[("f", (model.classes[a],))] == model.classes[fa]
