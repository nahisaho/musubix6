import pytest
from planner.model import Action
from planner.syntax import sexpr, parse_domain, parse_problem
from tests.support import DOMAIN, PROBLEM


# @id TEST-SYN-001 @verifies REQ-SYN-001 REQ-SYN-002 REQ-SYN-003 REQ-SYN-004
def test_syn_001():
    assert sexpr("(HELLO ; ignore\n World)") == ["hello", "world"]
    for bad in ("(", ")", "(a))", "(a) (b)", ""):
        with pytest.raises(ValueError):
            sexpr(bad)
    d = parse_domain(DOMAIN)
    assert d.name == "transport" and d.actions[0].parameters == (("?a", "location"), ("?b", "location"))
    assert d.actions[0].delete == frozenset({("at", "?a")})
    p = parse_problem(PROBLEM)
    assert p.goal == frozenset({("at", "c")})
    assert ("edge", "a", "b") in p.initial
    with pytest.raises(ValueError):
        parse_domain(DOMAIN[:-1] + "(:action move :parameters () :effect (and)))")


# @id TEST-SYN-002 @verifies REQ-SYN-005 REQ-SYN-006 REQ-SYN-007 REQ-SYN-008
def test_syn_002():
    for text in (DOMAIN.replace(":strips", ":adl"), DOMAIN.replace("(at ?a) (edge", "(not (at ?a)) (edge")):
        with pytest.raises(ValueError):
            parse_domain(text)
    for cost in (0, -1, True, 1.5):
        with pytest.raises(ValueError):
            Action("bad", cost=cost)
    facts = {("p",)}
    a = Action("immutable", add=facts)
    facts.clear()
    assert a.add == frozenset({("p",)}) and hash(a)
    p = parse_problem(PROBLEM.replace("a b c - location", "a b - location c"))
    assert p.objects == {"a": "location", "b": "location", "c": "object"}


# @id TEST-SYN-003 @verifies REQ-SYN-009
def test_syn_003():
    for text in (
        "(define (domain d) (:requirements (:adl)))",
        "(define (domain d) (:predicates ((nested))))",
        "(define (domain d) ((:types) location))",
    ):
        with pytest.raises(ValueError):
            parse_domain(text)


# @id TEST-SYN-004 @verifies REQ-SYN-010
def test_syn_004():
    for text in (
        PROBLEM.replace("a b c - location", "a a,b b,c c - location"),
        PROBLEM.replace("(problem trip)", "(problem bad,name)"),
        PROBLEM.replace("(at c)", "(at bad,name)"),
    ):
        with pytest.raises(ValueError):
            parse_problem(text)
    with pytest.raises(ValueError):
        parse_domain(DOMAIN.replace(":action move", ":action bad,name"))


# @id TEST-SYN-005 @verifies REQ-SYN-010
def test_syn_005():
    for text in (
        DOMAIN.replace("(domain transport)", "(domain 123)"),
        DOMAIN.replace(":action move", ":action 123"),
        DOMAIN.replace(":types location", ":types 123"),
    ):
        with pytest.raises(ValueError):
            parse_domain(text)
    with pytest.raises(ValueError):
        parse_problem(PROBLEM.replace("a b c - location", "a b 123 - location"))
