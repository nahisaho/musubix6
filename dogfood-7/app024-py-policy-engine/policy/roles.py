"""RBAC inheritance and case-sensitive resource permissions."""
from fnmatch import fnmatchcase

# @id CODE-ROLES-001 @implements REQ-ROLES-001 REQ-ROLES-002 REQ-ROLES-003 REQ-ROLES-004 REQ-ROLES-007 REQ-ROLES-008 REQ-ROLES-009 REQ-ROLES-010
def closure(graph, assigned):
    if not isinstance(assigned, (list, tuple)) or any(not isinstance(role, str) for role in assigned):
        raise ValueError("invalid assigned roles")
    if not isinstance(graph, dict):
        raise ValueError("invalid hierarchy")
    for role, parents in graph.items():
        if not isinstance(role, str) or not isinstance(parents, (list, tuple)):
            raise ValueError("invalid hierarchy")
        if any(not isinstance(parent, str) or parent not in graph for parent in parents):
            raise ValueError("unknown parent")
    states = {}
    for role in graph:
        stack = [(role, False)]
        while stack:
            current, leaving = stack.pop()
            if leaving:
                states[current] = 2
                continue
            if states.get(current) == 1:
                raise ValueError("role cycle")
            if states.get(current) == 2:
                continue
            states[current] = 1
            stack.append((current, True))
            stack.extend((parent, False) for parent in graph[current])
    result = set()
    if any(role not in graph for role in assigned):
        raise ValueError("unknown role")
    stack = list(assigned)
    while stack:
        role = stack.pop()
        if role not in result:
            result.add(role)
            stack.extend(graph[role])
    return sorted(result)

# @id CODE-ROLES-002 @implements REQ-ROLES-005 REQ-ROLES-006
def allowed(graph, grants, assigned, action, resource):
    roles = closure(graph, assigned)
    return any(
        fnmatchcase(action, action_pattern) and fnmatchcase(resource, resource_pattern)
        for role in roles for action_pattern, resource_pattern in grants.get(role, [])
    )
