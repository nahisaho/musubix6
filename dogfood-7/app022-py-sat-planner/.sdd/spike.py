"""Deterministic exhaustive reference checks, run from the application root."""
import random
from math import inf
from planner.model import Action, Task
from planner.search import solve
from planner.heuristic import hff
from planner.validation import validate


def reference_cost(task):
    costs, unsettled = {task.initial: 0}, {task.initial}
    while unsettled:
        state = min(unsettled, key=costs.get)
        unsettled.remove(state)
        if task.goal <= state:
            return costs[state]
        for a in task.actions:
            if a.pre <= state:
                next_state = frozenset((state - a.delete) | a.add)
                cost = costs[state] + a.cost
                if cost < costs.get(next_state, inf):
                    costs[next_state] = cost
                    unsettled.add(next_state)
    return inf


def run():
    rng = random.Random(22)
    universe = tuple((f"p{i}",) for i in range(5))
    def facts():
        return frozenset(f for f in universe if rng.random() < .3)
    for _ in range(100):
        task = Task(tuple(Action(f"a{i}", pre=facts(), add=facts(), delete=facts(), cost=rng.randint(1, 5)) for i in range(10)), facts(), facts())
        expected = reference_cost(task)
        result = solve(task)
        assert (result.cost if result.status == "solved" else inf) == expected
        if result.status == "solved":
            replay = validate(task, result.plan)
            assert replay.valid and replay.cost == result.cost
        closure = set(task.initial)
        while True:
            expanded = closure | set().union(*(a.add for a in task.actions if a.pre <= closure))
            if expanded == closure:
                break
            closure = expanded
        relaxed = hff(task, task.initial)
        assert (relaxed < inf) == (task.goal <= closure)
        assert relaxed == inf or relaxed <= len(task.actions)
    print("SPIKE PASS: 100 weighted tasks, optimal search/replay and relaxed reachability")


if __name__ == "__main__":
    run()
