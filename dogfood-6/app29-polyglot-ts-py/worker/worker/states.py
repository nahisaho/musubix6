import json
from collections import deque
from pathlib import Path

_T = json.loads((Path(__file__).resolve().parents[2] / "contract" / "states.json").read_text())


class UnknownStateError(Exception):
    pass


# @id CODE-CON-101
# @implements REQ-CON-001
STATES = list(_T["states"])
TRANSITIONS = {k: list(v) for k, v in _T["transitions"].items()}


def _known(s):
    if s not in TRANSITIONS:
        raise UnknownStateError(s)


# @id CODE-CON-102
# @implements REQ-CON-002, REQ-CON-003, REQ-CON-004
def can_transition(src, dst):
    _known(src)
    _known(dst)
    return dst in TRANSITIONS[src]


# @id CODE-CON-103
# @implements REQ-CON-005, REQ-CON-006
def is_terminal(s):
    _known(s)
    return s in _T["terminal"]


# @id CODE-CON-104
# @implements REQ-CON-007
def reachable(src):
    _known(src)
    return sorted(_closure(src))


def _closure(src):
    seen = set()
    stack = list(TRANSITIONS[src])
    while stack:
        s = stack.pop()
        if s not in seen:
            seen.add(s)
            stack.extend(TRANSITIONS[s])
    return seen


# @id CODE-CON-105
# @implements REQ-CON-008
def shortest_path(src, dst):
    _known(src)
    _known(dst)
    if src == dst:
        return [src]
    prev = {src: None}
    q = deque([src])
    while q:
        cur = q.popleft()
        for n in TRANSITIONS[cur]:
            if n in prev:
                continue
            prev[n] = cur
            if n == dst:
                path = [n]
                p = cur
                while p is not None:
                    path.append(p)
                    p = prev[p]
                return path[::-1]
            q.append(n)
    return None
