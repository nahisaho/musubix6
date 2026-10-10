import pytest
from dataclasses import replace
from planner.syntax import parse_domain, parse_problem
from planner.model import Action, Domain, Problem, apply
from planner.grounding import ground
from tests.support import DOMAIN, PROBLEM


# @id TEST-GRD-001 @verifies REQ-GRD-001 REQ-GRD-002 REQ-GRD-003 REQ-GRD-004
def test_grd_001():
    d, p = parse_domain(DOMAIN), parse_problem(PROBLEM)
    t = ground(d, p)
    assert len(t.actions) == 9
    a = next(a for a in t.actions if a.name == "move(a,b)")
    assert a.pre == frozenset({("at", "a"), ("edge", "a", "b")})
    assert a.add == frozenset({("at", "b")}) and a.delete == frozenset({("at", "a")})
    empty = replace(p, objects={}, initial=frozenset(), goal=frozenset())
    assert ground(d, empty).actions == ()
    assert len(ground(replace(d, actions=(Action("idle"),)), empty).actions) == 1


# @id TEST-GRD-002 @verifies REQ-GRD-005 REQ-GRD-006 REQ-GRD-007 REQ-GRD-008
def test_grd_002():
    d, p = parse_domain(DOMAIN), parse_problem(PROBLEM)
    with pytest.raises(ValueError):
        ground(d, replace(p, domain="other"))
    for fact in (("unknown",), ("at",), ("at", "missing"), ("at", "?x")):
        with pytest.raises(ValueError):
            ground(d, replace(p, goal=frozenset({fact})))
    bad = replace(d.actions[0], pre=frozenset({("at", "?unbound")}))
    with pytest.raises(ValueError):
        ground(replace(d, actions=(bad,)), replace(p, objects={}, initial=frozenset(), goal=frozenset()))
    a = Action("overlap", pre={("p",)}, add={("p",), ("q",)}, delete={("p",)})
    assert apply(frozenset({("p",)}), a) == frozenset({("p",), ("q",)})
    with pytest.raises(ValueError):
        apply(frozenset(), a)
