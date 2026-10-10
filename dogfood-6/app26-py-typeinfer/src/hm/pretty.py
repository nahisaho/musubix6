from .ast import Var, Lit, Lam, App, Let, If, Pair
from .types import TVar, Scheme

OPS = {"==": 1, "<": 1, "+": 2, "-": 2, "*": 3}


# @id CODE-PRETTY-001 @implements REQ-PRETTY-001 REQ-PRETTY-004 REQ-PRETTY-007
class Namer:
    def __init__(self):
        self.names = {}

    def name(self, var_id):
        if var_id not in self.names:
            i = len(self.names)
            self.names[var_id] = chr(97 + i % 26) + (str(i // 26) if i >= 26 else "")
        return self.names[var_id]


# @id CODE-PRETTY-002 @implements REQ-PRETTY-002 REQ-PRETTY-003 REQ-PRETTY-008
def _type(t, namer, prec):
    if isinstance(t, TVar):
        return namer.name(t.id)
    if t.name == "->" and len(t.args) == 2:
        s = f"{_type(t.args[0], namer, 1)} -> {_type(t.args[1], namer, 0)}"
        return f"({s})" if prec > 0 else s
    if t.name == "*" and len(t.args) == 2:
        s = f"{_type(t.args[0], namer, 2)} * {_type(t.args[1], namer, 1)}"
        return f"({s})" if prec > 1 else s
    if not t.args:
        return t.name
    s = t.name + "".join(" " + _type(a, namer, 3) for a in t.args)
    return f"({s})" if prec > 2 else s


def show_type(t, namer=None):
    return _type(t, namer or Namer(), 0)


# @id CODE-PRETTY-005 @implements REQ-PRETTY-005
def _occurring(t, out):
    if isinstance(t, TVar):
        if t.id not in out:
            out.append(t.id)
    else:
        for a in t.args:
            _occurring(a, out)


def show_scheme(sc, namer=None):
    namer = namer or Namer()
    order = []
    _occurring(sc.body, order)
    bound = [v for v in order if v in sc.vars]
    for v in bound:
        namer.name(v)
    body = show_type(sc.body, namer)
    if not bound:
        return body
    return "forall " + " ".join(namer.name(v) for v in bound) + ". " + body


# @id CODE-PRETTY-006 @implements REQ-PRETTY-006
def _binop(e):
    if (isinstance(e, App) and isinstance(e.fn, App) and isinstance(e.fn.fn, Var)
            and e.fn.fn.name in OPS):
        return e.fn.fn.name, e.fn.arg, e.arg
    return None


def _expr(e, prec):
    if isinstance(e, Var):
        return e.name
    if isinstance(e, Lit):
        if isinstance(e.value, bool):
            return "true" if e.value else "false"
        return str(e.value)
    if isinstance(e, Pair):
        return f"({_expr(e.left, 0)}, {_expr(e.right, 0)})"
    op = _binop(e)
    if op:
        name, l, r = op
        p = OPS[name]
        lp, rp = (p + 1, p + 1) if p == 1 else (p, p + 1)
        s = f"{_expr(l, lp)} {name} {_expr(r, rp)}"
        return f"({s})" if prec > p else s
    if isinstance(e, App):
        s = f"{_expr(e.fn, 4)} {_expr(e.arg, 5)}"
        return f"({s})" if prec > 4 else s
    if isinstance(e, Lam):
        params = []
        while isinstance(e, Lam):
            params.append(e.param)
            e = e.body
        s = "\\" + " ".join(params) + ". " + _expr(e, 0)
    elif isinstance(e, Let):
        kw = "let rec" if e.rec else "let"
        s = f"{kw} {e.name} = {_expr(e.value, 0)} in {_expr(e.body, 0)}"
    elif isinstance(e, If):
        s = f"if {_expr(e.cond, 0)} then {_expr(e.then, 0)} else {_expr(e.other, 0)}"
    else:
        raise TypeError(f"cannot show {e!r}")
    return f"({s})" if prec > 0 else s


def show_expr(e):
    return _expr(e, 0)
