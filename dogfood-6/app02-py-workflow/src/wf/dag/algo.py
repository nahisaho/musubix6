import heapq

from .errors import CycleError


def find_cycle(deps):
    WHITE, GREY, BLACK = 0, 1, 2
    color = {t: WHITE for t in deps}

    def visit(start):
        stack = [(start, iter(deps[start]))]
        path = [start]
        color[start] = GREY
        while stack:
            node, it = stack[-1]
            for nxt in it:
                if nxt not in color:
                    continue
                if color[nxt] == GREY:
                    return path[path.index(nxt):] + [nxt]
                if color[nxt] == WHITE:
                    color[nxt] = GREY
                    path.append(nxt)
                    stack.append((nxt, iter(deps[nxt])))
                    break
            else:
                color[node] = BLACK
                path.pop()
                stack.pop()
        return None

    for t in deps:
        if color[t] == WHITE:
            found = visit(t)
            if found:
                return found
    return None


def topological_order(deps):
    cyc = find_cycle(deps)
    if cyc:
        raise CycleError(cyc)
    index = {t: i for i, t in enumerate(deps)}
    pending = {t: len([d for d in ds if d in deps]) for t, ds in deps.items()}
    users = {t: [] for t in deps}
    for t, ds in deps.items():
        for d in ds:
            if d in users:
                users[d].append(t)
    ready = [index[t] for t, n in pending.items() if n == 0]
    heapq.heapify(ready)
    names = list(deps)
    out = []
    while ready:
        t = names[heapq.heappop(ready)]
        out.append(t)
        for u in users[t]:
            pending[u] -= 1
            if pending[u] == 0:
                heapq.heappush(ready, index[u])
    return out


def layers(deps):
    order = topological_order(deps)
    level = {}
    for t in order:
        level[t] = 1 + max((level[d] for d in deps[t] if d in level), default=-1)
    result = []
    for t in deps:
        while len(result) <= level[t]:
            result.append([])
        result[level[t]].append(t)
    return result


def dependents(deps, task_id):
    seen = set()
    frontier = [task_id]
    while frontier:
        cur = frontier.pop()
        for t, ds in deps.items():
            if cur in ds and t not in seen:
                seen.add(t)
                frontier.append(t)
    return [t for t in topological_order(deps) if t in seen]
