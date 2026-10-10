from itertools import product
from planner.model import Action, Task


# @id CODE-GRD-001 @implements REQ-GRD-001 REQ-GRD-002 REQ-GRD-003 REQ-GRD-004 REQ-GRD-005 REQ-GRD-006 REQ-GRD-007
def ground(domain, problem):
    if domain.name != problem.domain:
        raise ValueError("domain mismatch")
    if any(t not in domain.types for t in problem.objects.values()):
        raise ValueError("unknown object type")

    def check(atom, bindings):
        if not atom or atom[0] not in domain.predicates:
            raise ValueError("unknown predicate")
        declaration = domain.predicates[atom[0]]
        if len(atom) - 1 != len(declaration):
            raise ValueError("predicate arity mismatch")
        for argument, (_, required_type) in zip(atom[1:], declaration):
            source = bindings if argument.startswith("?") else problem.objects
            if argument not in source:
                raise ValueError("unbound variable or unknown object")
            if required_type != "object" and source[argument] != required_type:
                raise ValueError("predicate argument type mismatch")

    for atom in problem.initial | problem.goal:
        check(atom, {})
    grounded = []
    for action in domain.actions:
        bindings = dict(action.parameters)
        for atom in action.pre | action.add | action.delete:
            check(atom, bindings)
        pools = [sorted(n for n, t in problem.objects.items() if kind == "object" or t == kind) for _, kind in action.parameters]
        for assignment in product(*pools):
            mapping = dict(zip(bindings, assignment))
            def substitute(atoms):
                return frozenset(tuple(mapping.get(token, token) for token in atom) for atom in atoms)
            grounded.append(Action(
                f"{action.name}({','.join(assignment)})" if assignment else action.name,
                (), substitute(action.pre), substitute(action.add), substitute(action.delete), action.cost,
            ))
    return Task(tuple(grounded), problem.initial, problem.goal)
