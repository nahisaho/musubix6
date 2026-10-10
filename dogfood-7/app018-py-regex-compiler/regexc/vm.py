from regexc.syntax import Predicate


def replace_capture(captures, index, span):
    return captures[:index] + (span,) + captures[index + 1:]


# @id CODE-CAPTURES-001
# @implements REQ-CAPTURES-001 REQ-CAPTURES-002 REQ-CAPTURES-003 REQ-CAPTURES-004 REQ-CAPTURES-005 REQ-CAPTURES-006 REQ-CAPTURES-007 REQ-CAPTURES-008
def evaluate(node, text, pos, captures, budget):
    budget.tick()
    kind = node[0]
    if kind == "char":
        if pos < len(text) and node[1].accepts(text[pos]):
            yield pos + 1, captures
    elif kind == "seq":
        yield from sequence(node[1], text, 0, pos, captures, budget)
    elif kind == "alt":
        for child in node[1]:
            yield from evaluate(child, text, pos, captures, budget)
    elif kind == "group":
        for end, state in evaluate(node[2], text, pos, captures, budget):
            yield end, replace_capture(state, node[1], (pos, end))
    elif kind == "ref":
        span = captures[node[1]]
        if span is not None:
            value = text[span[0]:span[1]]
            for _ in value:
                budget.tick()
            if text.startswith(value, pos):
                yield pos + len(value), captures
    elif kind == "repeat":
        child, minimum, maximum, mode = node[1:]
        paths = repetition(child, text, pos, captures, budget, 0, minimum, maximum, mode)
        if mode == "possessive":
            result = next(paths, None)
            if result is not None:
                yield result
        else:
            yield from paths
    elif kind == "atomic":
        result = next(evaluate(node[1], text, pos, captures, budget), None)
        if result is not None:
            yield result
    elif kind in {"anchor", "look"}:
        yield from assertion(node, text, pos, captures, budget)
    else:
        raise ValueError("unknown VM node")


# @id CODE-SAFETY-004
# @implements REQ-SAFETY-013
def sequence(nodes, text, index, pos, captures, budget):
    if not nodes:
        yield pos, captures
        return
    stack = [(index, iter(evaluate(nodes[index], text, pos, captures, budget)))]
    while stack:
        index, paths = stack[-1]
        result = next(paths, None)
        if result is None:
            stack.pop()
            continue
        end, state = result
        if index + 1 == len(nodes):
            yield end, state
        else:
            stack.append((index + 1, iter(evaluate(nodes[index + 1], text, end, state, budget))))


# @id CODE-AUTOMATA-002
# @implements REQ-AUTOMATA-003 REQ-AUTOMATA-004 REQ-AUTOMATA-005 REQ-AUTOMATA-006 REQ-AUTOMATA-007 REQ-AUTOMATA-008 REQ-AUTOMATA-009 REQ-AUTOMATA-011
def repetition(child, text, pos, captures, budget, count, minimum, maximum, mode):
    stack = [("enter", count, pos, captures)]
    while stack:
        action, count, pos, state = stack.pop()
        if action == "yield":
            yield pos, state
        elif action == "iterate":
            paths = state
            result = next(paths, None)
            if result is None:
                continue
            end, captures = result
            stack.append(("iterate", count, pos, paths))
            if maximum is None and end == pos and count + 1 >= minimum:
                stack.append(("yield", count + 1, end, captures))
            else:
                stack.append(("enter", count + 1, end, captures))
        else:
            budget.tick()
            can_stop = count >= minimum
            if mode != "lazy" and can_stop:
                stack.append(("yield", count, pos, state))
            if maximum is None or count < maximum:
                stack.append(("iterate", count, pos, iter(evaluate(child, text, pos, state, budget))))
            if mode == "lazy" and can_stop:
                stack.append(("yield", count, pos, state))


# @id CODE-ASSERTIONS-001
# @implements REQ-ASSERTIONS-001 REQ-ASSERTIONS-002 REQ-ASSERTIONS-003 REQ-ASSERTIONS-004 REQ-ASSERTIONS-005 REQ-ASSERTIONS-006 REQ-ASSERTIONS-007 REQ-ASSERTIONS-008 REQ-ASSERTIONS-009 REQ-ASSERTIONS-010
def assertion(node, text, pos, captures, budget):
    if node[0] == "anchor":
        mode = node[1]
        left = pos > 0 and Predicate("word").accepts(text[pos - 1])
        right = pos < len(text) and Predicate("word").accepts(text[pos])
        passed = {"^": pos == 0, "$": pos == len(text), "b": left != right, "B": left == right}[mode]
        if passed:
            yield pos, captures
        return
    mode, child, width = node[1:]
    start = pos - width if "behind" in mode else pos
    result = None
    if start >= 0:
        for end, state in evaluate(child, text, start, captures, budget):
            if "behind" not in mode or end == pos:
                result = (end, state)
                break
    if mode.startswith("not_"):
        if result is None:
            yield pos, captures
    elif result is not None:
        yield pos, result[1]
