"""Runtime assumptions and independent small-CNF oracle."""
from fractions import Fraction
from itertools import product


def brute_cnf(n, clauses):
    for values in product((False, True), repeat=n):
        if all(any(values[abs(lit) - 1] == (lit > 0) for lit in clause)
               for clause in clauses):
            return dict(enumerate(values, 1))
    return None


if __name__ == "__main__":
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parents[1]))
    from smt.arithmetic import feasible
    from smt.euf import closure
    from smt.terms import Term, Linear, Relation

    assert Fraction("1/3") * 3 == 1
    assert hash(("f", ("a",))) == hash(("f", ("a",)))
    assert brute_cnf(1, [[1], [-1]]) is None
    assert brute_cnf(2, [[1, 2], [-1]]) == {1: False, 2: True}
    assert feasible([Relation(Linear({"x": 3}, -1), "eq")]) == {"x": Fraction(1, 3)}
    a, b = Term("a"), Term("b")
    fa, fb = Term("f", (a,)), Term("f", (b,))
    assert closure([(fa, fb)], [(a, b)]) is not None
    assert closure([(a, b)], [(Term("g", (fa,)), Term("g", (fb,)))]) is None
    print("Fraction, term keys, CNF oracle, exact simplex and nested EUF: PASS")
