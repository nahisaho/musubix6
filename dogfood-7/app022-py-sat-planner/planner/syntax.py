import re
from planner.model import Action, Domain, Problem


# @id CODE-SYN-001 @implements REQ-SYN-001 REQ-SYN-002 REQ-SYN-003 REQ-SYN-004 REQ-SYN-005 REQ-SYN-008
def sexpr(text):
    tokens = re.findall(r"\(|\)|[^\s()]+", re.sub(r";[^\n]*", "", text).lower())
    stack, roots = [], []
    for token in tokens:
        if token == "(":
            node = []
            (stack[-1] if stack else roots).append(node)
            stack.append(node)
        elif token == ")":
            if not stack:
                raise ValueError("unexpected closing parenthesis")
            stack.pop()
        else:
            if not stack:
                raise ValueError("symbol outside expression")
            if not re.fullmatch(r"(?:[?:]?[a-z][a-z0-9_-]*|[0-9]+|-)", token):
                raise ValueError("invalid PDDL token")
            stack[-1].append(token)
    if stack or len(roots) != 1:
        raise ValueError("expected one balanced expression")
    return roots[0]


def typed(tokens):
    result, pending = [], []
    i = 0
    while i < len(tokens):
        name = tokens[i]
        if not isinstance(name, str):
            raise ValueError("invalid typed declaration")
        if name == "-":
            if not pending or i + 1 >= len(tokens) or not isinstance(tokens[i + 1], str) or tokens[i + 1] == "-":
                raise ValueError("missing type")
            require_symbol(tokens[i + 1])
            result.extend((n, tokens[i + 1]) for n in pending)
            pending = []
            i += 2
        else:
            require_symbol(name[1:] if name.startswith("?") else name)
            pending.append(name)
            i += 1
    result.extend((n, "object") for n in pending)
    if len({n for n, _ in result}) != len(result):
        raise ValueError("duplicate declaration")
    return tuple(result)


def literals(expr, effects=False):
    if not isinstance(expr, list):
        raise ValueError("expected literal expression")
    nodes = expr[1:] if expr and expr[0] == "and" else [expr] if expr else []
    positive, negative = set(), set()
    for node in nodes:
        neg = isinstance(node, list) and node and node[0] == "not"
        if neg:
            if not effects or len(node) != 2:
                raise ValueError("negative preconditions/goals unsupported")
            node = node[1]
        if not isinstance(node, list) or not node or not all(isinstance(s, str) for s in node):
            raise ValueError("invalid atom")
        if node[0] in {"and", "or", "not", "forall", "exists", "when", "=", "increase"}:
            raise ValueError("unsupported logical construct")
        require_symbol(node[0])
        for argument in node[1:]:
            require_symbol(argument[1:] if argument.startswith("?") else argument)
        (negative if neg else positive).add(tuple(node))
    return frozenset(positive), frozenset(negative)


def definition(text, kind):
    tree = sexpr(text)
    if len(tree) < 2 or tree[0] != "define" or not isinstance(tree[1], list) or len(tree[1]) != 2 or tree[1][0] != kind:
        raise ValueError(f"expected {kind} definition")
    if not isinstance(tree[1][1], str):
        raise ValueError("invalid definition name")
    require_symbol(tree[1][1])
    return tree[1][1], tree[2:]


def parse_domain(text):
    name, sections = definition(text, "domain")
    types, predicates, actions, seen = ("object",), {}, [], set()
    for section in sections:
        if not isinstance(section, list) or not section:
            raise ValueError("invalid section")
        tag = section[0]
        require_symbol(tag, keyword=True)
        if tag != ":action" and tag in seen:
            raise ValueError("duplicate section")
        seen.add(tag)
        if tag == ":requirements":
            for requirement in section[1:]:
                require_symbol(requirement, keyword=True)
            if set(section[1:]) - {":strips", ":typing"}:
                raise ValueError("unsupported requirements")
        elif tag == ":types":
            if any(not isinstance(t, str) or t.startswith("?") or t == "-" for t in section[1:]):
                raise ValueError("only flat types are supported")
            if len(set(section[1:])) != len(section[1:]):
                raise ValueError("duplicate type")
            for kind in section[1:]:
                require_symbol(kind)
            types = tuple(dict.fromkeys(("object", *section[1:])))
        elif tag == ":predicates":
            for declaration in section[1:]:
                if not isinstance(declaration, list) or not declaration:
                    raise ValueError("invalid predicate")
                require_symbol(declaration[0])
                if declaration[0] in predicates:
                    raise ValueError("invalid or duplicate predicate")
                params = typed(declaration[1:])
                if any(not n.startswith("?") for n, _ in params):
                    raise ValueError("predicate arguments must be variables")
                predicates[declaration[0]] = params
        elif tag == ":action":
            if len(section) < 2 or not isinstance(section[1], str) or any(a.name == section[1] for a in actions):
                raise ValueError("invalid or duplicate action")
            require_symbol(section[1])
            if len(section[2:]) % 2:
                raise ValueError("missing action field value")
            fields = {}
            for key, value in zip(section[2::2], section[3::2]):
                if not isinstance(key, str) or key not in {":parameters", ":precondition", ":effect", ":cost"} or key in fields:
                    raise ValueError("unsupported or duplicate action field")
                fields[key] = value
            params = typed(fields.get(":parameters", []))
            if any(not n.startswith("?") for n, _ in params):
                raise ValueError("parameters must be variables")
            pre, _ = literals(fields.get(":precondition", []))
            add, delete = literals(fields.get(":effect", []), effects=True)
            raw_cost = fields.get(":cost", "1")
            if not isinstance(raw_cost, str) or not re.fullmatch(r"[0-9]+", raw_cost):
                raise ValueError("invalid action cost")
            actions.append(Action(section[1], params, pre, add, delete, int(raw_cost)))
        else:
            raise ValueError(f"unsupported domain section {tag}")
    for params in [*predicates.values(), *(a.parameters for a in actions)]:
        if any(t not in types for _, t in params):
            raise ValueError("unknown type")
    return Domain(name, predicates, tuple(actions), types)


# @id CODE-SYN-003 @implements REQ-SYN-009 REQ-SYN-010
def require_symbol(value, keyword=False):
    pattern = r":[a-z][a-z0-9_-]*" if keyword else r"[a-z][a-z0-9_-]*"
    if not isinstance(value, str) or not re.fullmatch(pattern, value):
        raise ValueError("expected a symbol")


def parse_problem(text):
    _, sections = definition(text, "problem")
    fields = {}
    for section in sections:
        if not isinstance(section, list) or not section or not isinstance(section[0], str) or section[0] in fields:
            raise ValueError("invalid or duplicate problem section")
        if section[0] not in {":domain", ":objects", ":init", ":goal"}:
            raise ValueError("unsupported problem section")
        fields[section[0]] = section[1:]
    if len(fields.get(":domain", [])) != 1 or not isinstance(fields[":domain"][0], str) or len(fields.get(":goal", [])) != 1:
        raise ValueError("domain and one goal expression are required")
    require_symbol(fields[":domain"][0])
    objects = dict(typed(fields.get(":objects", [])))
    if any(n.startswith("?") for n in objects):
        raise ValueError("objects must be constants")
    initial, _ = literals(["and", *fields.get(":init", [])])
    goal, _ = literals(fields[":goal"][0])
    return Problem(fields[":domain"][0], objects, initial, goal)
