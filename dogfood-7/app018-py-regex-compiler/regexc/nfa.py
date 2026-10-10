from dataclasses import dataclass
from regexc.syntax import Predicate


def regular(node):
    kind = node[0]
    if kind == "char":
        return True
    if kind in {"seq", "alt"}:
        return all(regular(n) for n in node[1])
    if kind == "repeat":
        return node[4] != "possessive" and regular(node[1])
    return False


# @id CODE-AUTOMATA-001
# @implements REQ-AUTOMATA-001 REQ-AUTOMATA-002 REQ-AUTOMATA-010
@dataclass(frozen=True)
class NFA:
    edges: tuple
    start: int
    accept: int

    def closure(self, states, budget):
        result = set(states)
        pending = list(states)
        while pending:
            state = pending.pop()
            budget.tick()
            for predicate, destination in self.edges[state]:
                if predicate is None and destination not in result:
                    result.add(destination)
                    pending.append(destination)
        return result

    def fullmatch(self, text, pos, budget):
        states = self.closure({self.start}, budget)
        for char in text[pos:]:
            following = set()
            for state in states:
                for predicate, destination in self.edges[state]:
                    budget.tick()
                    if predicate is not None and predicate.accepts(char):
                        following.add(destination)
            states = self.closure(following, budget)
            if not states:
                return False
        return self.accept in states


# @id CODE-SAFETY-002
# @implements REQ-SAFETY-011
class Builder:
    def __init__(self):
        self.edges = []

    def state(self):
        if len(self.edges) >= 10000:
            raise ValueError("NFA allocation limit exceeded")
        self.edges.append([])
        return len(self.edges) - 1

    def link(self, a, b, predicate=None):
        self.edges[a].append((predicate, b))

    def fragment(self, node):
        kind = node[0]
        start, end = self.state(), self.state()
        if kind == "char":
            self.link(start, end, node[1])
        elif kind == "seq":
            cursor = start
            for child in node[1]:
                a, b = self.fragment(child)
                self.link(cursor, a)
                cursor = b
            self.link(cursor, end)
        elif kind == "alt":
            for child in node[1]:
                a, b = self.fragment(child)
                self.link(start, a)
                self.link(b, end)
        elif kind == "repeat":
            child, minimum, maximum = node[1:4]
            cursor = start
            for _ in range(minimum):
                a, b = self.fragment(child)
                self.link(cursor, a)
                cursor = b
            if maximum is None:
                a, b = self.fragment(child)
                self.link(cursor, end)
                self.link(cursor, a)
                self.link(b, cursor)
            else:
                for _ in range(maximum - minimum):
                    a, b = self.fragment(child)
                    self.link(cursor, end)
                    self.link(cursor, a)
                    cursor = b
                self.link(cursor, end)
        else:
            raise ValueError("nonregular NFA node")
        return start, end

    def build(self, node):
        start, end = self.fragment(node)
        return NFA(tuple(tuple(e) for e in self.edges), start, end)
