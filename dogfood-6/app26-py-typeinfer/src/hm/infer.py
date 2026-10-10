from .ast import Var, Lit, Lam, App, Let, If, Pair
from .parser import parse
from .types import (TVar, TCon, INT, BOOL, fn, pair, Subst, Scheme, TypeEnv,
                    Supply, generalize, instantiate, rename_vars)
from .unify import unify, UnifyError


class InferError(Exception):
    def __init__(self, kind, msg, pos=None, expected=None, actual=None, name=None,
                 var=None, type=None):
        super().__init__(msg)
        self.kind = kind
        self.msg = msg
        self.pos = pos
        self.expected = expected
        self.actual = actual
        self.name = name
        self.var = var
        self.type = type


# @id CODE-INFER-011 @implements REQ-INFER-010 REQ-INFER-011
def initial_env():
    a, b = TVar(0), TVar(1)
    ints = fn(INT, fn(INT, INT))
    return TypeEnv({
        "+": Scheme((), ints),
        "-": Scheme((), ints),
        "*": Scheme((), ints),
        "<": Scheme((), fn(INT, fn(INT, BOOL))),
        "==": Scheme((0,), fn(a, fn(a, BOOL))),
        "fst": Scheme((0, 1), fn(pair(a, b), a)),
        "snd": Scheme((0, 1), fn(pair(a, b), b)),
    })


def _mismatch(e, pos, expected, actual):
    if e.kind == "occurs":
        return InferError("occurs", "infinite type", pos, expected, actual,
                          var=e.var, type=e.type)
    return InferError("mismatch", "type mismatch", pos, expected, actual)


def _unify_at(expected, actual, pos, s):
    try:
        return unify(expected, actual, s)
    except UnifyError as e:
        raise _mismatch(e, pos, expected, actual) from None


# @id CODE-INFER-002 @implements REQ-INFER-001 REQ-INFER-002 REQ-INFER-003
def _var(e, env, supply):
    if e.name not in env:
        raise InferError("unbound", f"unbound variable {e.name}", e.pos, name=e.name)
    return Subst(), instantiate(env[e.name], supply)


def infer_expr(e, env, supply):
    if isinstance(e, Lit):
        return Subst(), BOOL if isinstance(e.value, bool) else INT
    if isinstance(e, Var):
        return _var(e, env, supply)
    if isinstance(e, Lam):
        return _lam(e, env, supply)
    if isinstance(e, App):
        return _app(e, env, supply)
    if isinstance(e, Let):
        return _let(e, env, supply)
    if isinstance(e, If):
        return _if(e, env, supply)
    if isinstance(e, Pair):
        s1, t1 = infer_expr(e.left, env, supply)
        s2, t2 = infer_expr(e.right, s1.apply_env(env), supply)
        return s2.compose(s1), pair(s2.apply(t1), t2)
    raise TypeError(f"unknown expression {e!r}")


# @id CODE-INFER-004 @implements REQ-INFER-004 REQ-INFER-007
def _lam(e, env, supply):
    tv = supply.fresh()
    s1, t1 = infer_expr(e.body, env.extend(e.param, Scheme((), tv)), supply)
    return s1, fn(s1.apply(tv), t1)


# @id CODE-INFER-005 @implements REQ-INFER-005 REQ-INFER-012 REQ-INFER-014
def _app(e, env, supply):
    s1, t1 = infer_expr(e.fn, env, supply)
    s2, t2 = infer_expr(e.arg, s1.apply_env(env), supply)
    s = s2.compose(s1)
    t1 = s2.apply(t1)
    if isinstance(t1, TCon) and t1.name == "->":
        s3 = _unify_at(t1.args[0], t2, e.arg.pos, s)
        return s3, s3.apply(t1.args[1])
    res = supply.fresh()
    want = fn(t2, res)
    if isinstance(t1, TCon):
        raise InferError("mismatch", "not a function", e.fn.pos, want, t1)
    s3 = _unify_at(t1, want, e.pos, s)
    return s3, s3.apply(res)


# @id CODE-INFER-006 @implements REQ-INFER-006 REQ-INFER-008
def _let(e, env, supply):
    if e.rec:
        tv = supply.fresh()
        s1, t1 = infer_expr(e.value, env.extend(e.name, Scheme((), tv)), supply)
        s = _unify_at(s1.apply(tv), t1, e.value.pos, s1)
        bound = s.apply(tv)
    else:
        s, bound = infer_expr(e.value, env, supply)
    env1 = s.apply_env(env)
    s2, t2 = infer_expr(e.body, env1.extend(e.name, generalize(env1, bound)), supply)
    return s2.compose(s), t2


# @id CODE-INFER-009 @implements REQ-INFER-009
def _if(e, env, supply):
    s1, tc = infer_expr(e.cond, env, supply)
    s = _unify_at(BOOL, tc, e.cond.pos, s1)
    s2, tt = infer_expr(e.then, s.apply_env(env), supply)
    s = s2.compose(s)
    s3, te = infer_expr(e.other, s.apply_env(env), supply)
    s = s3.compose(s)
    s = _unify_at(s.apply(tt), te, e.other.pos, s)
    return s, s.apply(te)


def _order(t, seen):
    if isinstance(t, TVar):
        if t.id not in seen:
            seen[t.id] = len(seen)
    else:
        for a in t.args:
            _order(a, seen)


# @id CODE-INFER-013 @implements REQ-INFER-013
def infer_program(src):
    s, t = infer_expr(parse(src), initial_env(), Supply())
    t = s.apply(t)
    seen = {}
    _order(t, seen)
    t = rename_vars(t, {k: TVar(v) for k, v in seen.items()})
    return Scheme(tuple(range(len(seen))), t)
