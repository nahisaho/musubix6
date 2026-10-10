"""Independent deterministic oracles supplement the traced contract examples."""
from fractions import Fraction
from itertools import product
import random
from smt.arithmetic import feasible
from smt.euf import closure
from smt.sat import CDCL
from smt.terms import Linear, Relation, Term


# @id TEST-SAT-009 @verifies REQ-SAT-004 REQ-SAT-005 REQ-SAT-006
def test_sat_009_randomized_exhaustive_oracle():
    rng = random.Random(14014)
    for n in range(1, 7):
        for _ in range(400):
            clauses = [[rng.choice((-1, 1)) * rng.randint(1, n)
                        for _ in range(rng.randint(0, 4))]
                       for _ in range(rng.randint(0, 15))]
            expected = any(all(any(values[abs(lit) - 1] == (lit > 0) for lit in clause)
                               for clause in clauses)
                           for values in product((False, True), repeat=n))
            solver = CDCL(n, clauses)
            model = solver.solve()
            assert (model is not None) == expected, clauses
            if model is not None:
                assert all(any(model[abs(lit)] == (lit > 0) for lit in c) for c in clauses)
            assert solver.solve() == model


def interval_oracle(relations):
    lower, upper = None, None
    lower_strict, upper_strict = False, False
    reverse = {"lt": "gt", "gt": "lt", "le": "ge", "ge": "le", "eq": "eq"}
    for relation in relations:
        a = dict(relation.expression.coeffs).get("x", Fraction(0))
        if a == 0:
            if not relation.holds({}):
                return False
            continue
        value = -relation.expression.constant / a
        op = relation.op if a > 0 else reverse[relation.op]
        if op in ("ge", "gt", "eq"):
            strict = op == "gt"
            if lower is None or value > lower:
                lower, lower_strict = value, strict
            elif value == lower:
                lower_strict |= strict
        if op in ("le", "lt", "eq"):
            strict = op == "lt"
            if upper is None or value < upper:
                upper, upper_strict = value, strict
            elif value == upper:
                upper_strict |= strict
    return (lower is None or upper is None or lower < upper
            or lower == upper and not (lower_strict or upper_strict))


# @id TEST-ARITHMETIC-009 @verifies REQ-ARITHMETIC-005 REQ-ARITHMETIC-006 REQ-ARITHMETIC-008
def test_arithmetic_009_randomized_interval_oracle():
    rng = random.Random(14015)
    for _ in range(800):
        relations = [Relation(Linear({"x": rng.randint(-4, 4)}, Fraction(rng.randint(-5, 5), 3)),
                              rng.choice(("le", "ge", "eq", "lt", "gt")))
                     for _ in range(rng.randint(0, 8))]
        model = feasible(relations)
        assert (model is not None) == interval_oracle(relations), relations
        if model is not None:
            assert all(relation.holds(model) for relation in relations)


# @id TEST-EUF-009 @verifies REQ-EUF-003 REQ-EUF-004 REQ-EUF-005 REQ-EUF-007
def test_euf_009_randomized_relation_matrix_oracle():
    rng = random.Random(14016)
    a, b, c = Term("a"), Term("b"), Term("c")
    terms = [a, b, c, Term("f", (a,)), Term("f", (b,)), Term("g", (c,)),
             Term("h", (Term("f", (a,)),)), Term("h", (Term("f", (b,)),))]
    for _ in range(200):
        equalities = [tuple(rng.sample(terms, 2)) for _ in range(rng.randint(0, 6))]
        disequalities = [tuple(rng.sample(terms, 2)) for _ in range(rng.randint(0, 4))]
        relation = {(term, term) for term in terms}
        relation.update(equalities)
        while True:
            before = len(relation)
            relation |= {(right, left) for left, right in list(relation)}
            relation |= {(left, right) for left in terms for mid in terms for right in terms
                         if (left, mid) in relation and (mid, right) in relation}
            relation |= {(left, right) for left in terms for right in terms
                         if left.symbol == right.symbol and len(left.args) == len(right.args)
                         and all(pair in relation for pair in zip(left.args, right.args))}
            if len(relation) == before:
                break
        expected = not any(pair in relation for pair in disequalities)
        # Reflexive pairs ensure the model contains every term in the oracle domain.
        model = closure(equalities + [(term, term) for term in terms], disequalities)
        assert (model is not None) == expected
        if model is not None:
            assert all(model.equal(left, right) == ((left, right) in relation)
                       for left in terms for right in terms)
