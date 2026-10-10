import argparse
import json
from dataclasses import dataclass, asdict
from pathlib import Path
from planner.model import apply
from planner.syntax import parse_domain, parse_problem
from planner.grounding import ground
from planner.search import solve


@dataclass(frozen=True)
class Validation:
    valid: bool
    state: frozenset
    cost: int
    step: int
    reason: str = ""


# @id CODE-VAL-001 @implements REQ-VAL-001 REQ-VAL-002 REQ-VAL-003 REQ-VAL-004 REQ-VAL-008 REQ-VAL-009
def validate(task, plan):
    actions = {a.name: a for a in task.actions}
    state, cost = task.initial, 0
    if len(actions) != len(task.actions):
        return Validation(False, state, cost, 0, "ambiguous action labels")
    for step, name in enumerate(plan):
        if name not in actions:
            return Validation(False, state, cost, step, "unknown action")
        action = actions[name]
        if not action.pre <= state:
            return Validation(False, state, cost, step, "unsatisfied preconditions")
        state = apply(state, action)
        cost += action.cost
    if not task.goal <= state:
        return Validation(False, state, cost, len(plan), "missing goal")
    return Validation(True, state, cost, len(plan))


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise ValueError(message)


# @id CODE-VAL-002 @implements REQ-VAL-005 REQ-VAL-006 REQ-VAL-007 REQ-VAL-009
def main(argv=None):
    parser = Parser(description="Typed STRIPS PDDL-lite planner")
    parser.add_argument("domain")
    parser.add_argument("problem")
    parser.add_argument("--algorithm", choices=("astar", "gbfs"), default="astar")
    parser.add_argument("--limit", type=int, default=100000)
    try:
        args = parser.parse_args(argv)
        task = ground(parse_domain(Path(args.domain).read_text()), parse_problem(Path(args.problem).read_text()))
        result = solve(task, args.algorithm, limit=args.limit)
        payload = asdict(result)
        payload["valid"] = result.status == "solved" and validate(task, result.plan).valid
        if result.status == "solved" and not payload["valid"]:
            raise ValueError("solver returned an invalid plan")
        print(json.dumps(payload))
        return {"solved": 0, "unsolvable": 1, "limit": 3}[result.status]
    except (ValueError, OSError, UnicodeError) as error:
        print(json.dumps({"error": str(error)}))
        return 2
