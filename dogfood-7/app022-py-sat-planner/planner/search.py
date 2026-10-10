from dataclasses import dataclass
from heapq import heappush, heappop
from itertools import count
from planner.model import apply
from planner.heuristic import hff


@dataclass(frozen=True)
class Result:
    status: str
    plan: tuple = ()
    cost: int = 0
    expanded: int = 0
    generated: int = 0


def zero_heuristic(task, state):
    return 0


def priority(algorithm, estimate, task, state, cost):
    value = estimate(task, state)
    return value + cost if algorithm == "astar" else value


# @id CODE-SRC-001 @implements REQ-SRC-001 REQ-SRC-002 REQ-SRC-003 REQ-SRC-004 REQ-SRC-005 REQ-SRC-006 REQ-SRC-007 REQ-SRC-008
def solve(task, algorithm="astar", heuristic=None, limit=100000):
    if algorithm not in {"astar", "gbfs"} or type(limit) is not int or limit < 0:
        raise ValueError("invalid search algorithm or limit")
    estimate = heuristic if heuristic is not None else hff if algorithm == "gbfs" else zero_heuristic
    queue, serial = [], count()
    best = {task.initial: 0}
    heappush(queue, (priority(algorithm, estimate, task, task.initial, 0), next(serial), 0, task.initial, ()))
    expanded, generated = 0, 1
    while queue:
        _, _, cost, state, plan = heappop(queue)
        if cost != best[state]:
            continue
        if task.goal <= state:
            return Result("solved", plan, cost, expanded, generated)
        if expanded >= limit:
            return Result("limit", (), 0, expanded, generated)
        expanded += 1
        for action in task.actions:
            if not action.pre <= state:
                continue
            successor = apply(state, action)
            new_cost = cost + action.cost
            if new_cost >= best.get(successor, float("inf")):
                continue
            best[successor] = new_cost
            rank = priority(algorithm, estimate, task, successor, new_cost)
            heappush(queue, (rank, next(serial), new_cost, successor, plan + (action.name,)))
            generated += 1
    return Result("unsolvable", (), 0, expanded, generated)
