import json
import sys
from smt.solver import Solver
from smt.terms import Term, Linear, Relation, rational


def read_term(value):
    if isinstance(value, str):
        return Term(value)
    return Term(value["symbol"], tuple(read_term(arg) for arg in value.get("args", [])))


def term_json(term):
    return {"symbol": term.symbol, "args": [term_json(arg) for arg in term.args]}


# @id CODE-SOLVER-003 @implements REQ-SOLVER-008 REQ-SOLVER-009 REQ-SOLVER-010 REQ-SOLVER-011
def main():
    try:
        payload = json.load(sys.stdin)
        solver = Solver()
        positions = []
        for value in payload.get("atoms", []):
            if value["kind"] == "bool":
                atom = value["name"]
            elif value["kind"] == "lra":
                atom = Relation(Linear(value.get("coeffs", {}), -rational(value.get("rhs", 0))),
                                value["op"])
            elif value["kind"] == "euf":
                atom = (read_term(value["left"]), read_term(value["right"]))
            else:
                raise ValueError("unknown atom kind")
            positions.append(solver.atom(atom))
        for clause in payload.get("clauses", []):
            if any(type(lit) is not int or not 1 <= abs(lit) <= len(positions) for lit in clause):
                raise ValueError("literal must reference a declared atom position")
            solver.add_clause([positions[abs(lit) - 1] * (1 if lit > 0 else -1) for lit in clause])
        result = solver.check(payload.get("budget", 10000))
        output = {"status": result.status, "stats": result.stats}
        if result.status == "sat":
            output["boolean"] = result.boolean
            output["arithmetic"] = {name: str(value) for name, value in result.arithmetic.items()}
            output["euf"] = {
                "classes": {term.symbol: value for term, value in result.euf.classes.items() if not term.args},
                "terms": [{"term": term_json(term), "value": value}
                          for term, value in result.euf.classes.items()],
                "functions": [{"symbol": symbol, "args": list(args), "value": value}
                              for (symbol, args), value in result.euf.functions.items()],
            }
        print(json.dumps(output, sort_keys=True))
        return 0
    except (TypeError, ValueError, KeyError, AttributeError, ZeroDivisionError) as error:
        print(json.dumps({"status": "error", "error": str(error)}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
