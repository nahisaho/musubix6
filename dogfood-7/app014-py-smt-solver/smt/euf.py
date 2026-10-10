from dataclasses import dataclass
from smt.terms import Term


# @id CODE-EUF-001 @implements REQ-EUF-008
@dataclass
class EUFModel:
    classes: dict
    functions: dict

    def equal(self, left, right):
        return self.classes[left] == self.classes[right]

    def value(self, term):
        if term in self.classes:
            return self.classes[term]
        args = tuple(self.value(arg) for arg in term.args)
        return self.functions.get((term.symbol, args), 0)


# @id CODE-EUF-002 @implements REQ-EUF-001 REQ-EUF-002 REQ-EUF-003 REQ-EUF-004 REQ-EUF-005 REQ-EUF-006 REQ-EUF-007 REQ-EUF-008
def closure(equalities, disequalities):
    equalities, disequalities = list(equalities), list(disequalities)
    parent, rank = {}, {}

    def add(term):
        if not isinstance(term, Term):
            raise TypeError("ground term required")
        if term in parent:
            return
        parent[term], rank[term] = term, 0
        for arg in term.args:
            add(arg)

    for left, right in equalities + disequalities:
        add(left)
        add(right)

    def find(term):
        while parent[term] != term:
            parent[term] = parent[parent[term]]
            term = parent[term]
        return term

    def union(left, right):
        left, right = find(left), find(right)
        if left == right:
            return False
        if rank[left] < rank[right]:
            left, right = right, left
        parent[right] = left
        if rank[left] == rank[right]:
            rank[left] += 1
        return True

    for left, right in equalities:
        union(left, right)
    changed = True
    while changed:
        changed, signatures = False, {}
        for term in parent:
            signature = (term.symbol, tuple(find(arg) for arg in term.args))
            if signature in signatures:
                changed |= union(term, signatures[signature])
            else:
                signatures[signature] = term
    if any(find(left) == find(right) for left, right in disequalities):
        return None
    ids = {}
    for term in parent:
        root = find(term)
        if root not in ids:
            ids[root] = len(ids)
    classes = {term: ids[find(term)] for term in parent}
    functions = {(term.symbol, tuple(classes[arg] for arg in term.args)): classes[term]
                 for term in parent}
    return EUFModel(classes, functions)
