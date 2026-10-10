from math import inf


# @id CODE-HFF-001 @implements REQ-HFF-001 REQ-HFF-002 REQ-HFF-003 REQ-HFF-004 REQ-HFF-005 REQ-HFF-006 REQ-HFF-007 REQ-HFF-008
def hff(task, state):
    facts = set(state)
    if task.goal <= facts:
        return 0
    achievers = {}
    layer = 0
    while not task.goal <= facts:
        layer += 1
        additions = set()
        for index, action in enumerate(task.actions):
            if action.pre <= facts:
                for fact in sorted(action.add - facts):
                    if fact not in achievers:
                        achievers[fact] = (layer, index)
                    additions.add(fact)
        if not additions:
            return inf
        facts.update(additions)
    selected, pending = set(), set(task.goal - state)
    while pending:
        fact = max(pending, key=lambda f: (achievers[f][0], f))
        pending.remove(fact)
        _, index = achievers[fact]
        if index not in selected:
            selected.add(index)
            action = task.actions[index]
            pending.difference_update(action.add)
            pending.update(action.pre - state)
    return len(selected)
