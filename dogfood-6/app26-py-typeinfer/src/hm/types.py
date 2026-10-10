from dataclasses import dataclass
from typing import Tuple


# @id CODE-TYPES-001 @implements REQ-TYPES-001
@dataclass(frozen=True)
class TVar:
    id: int


@dataclass(frozen=True)
class TCon:
    name: str
    args: Tuple = ()


INT = TCon("Int")
BOOL = TCon("Bool")


def fn(a, b):
    return TCon("->", (a, b))


def pair(a, b):
    return TCon("*", (a, b))


# @id CODE-TYPES-002 @implements REQ-TYPES-002
def ftv(x):
    if isinstance(x, TVar):
        return {x.id}
    if isinstance(x, TCon):
        out = set()
        for a in x.args:
            out |= ftv(a)
        return out
    if isinstance(x, Scheme):
        return ftv(x.body) - set(x.vars)
    if isinstance(x, TypeEnv):
        out = set()
        for sc in x.values():
            out |= ftv(sc)
        return out
    raise TypeError(f"ftv: unsupported {x!r}")


@dataclass(frozen=True)
class Scheme:
    vars: Tuple
    body: object


class TypeEnv(dict):
    def extend(self, name, scheme):
        out = TypeEnv(self)
        out[name] = scheme
        return out


# @id CODE-TYPES-003 @implements REQ-TYPES-003 REQ-TYPES-004 REQ-TYPES-007
class Subst:
    def __init__(self, mapping=None):
        self.map = dict(mapping or {})

    def __len__(self):
        return len(self.map)

    def __eq__(self, other):
        return isinstance(other, Subst) and self.map == other.map

    def apply(self, t, _seen=()):
        if isinstance(t, TVar):
            if t.id not in self.map:
                return t
            if t.id in _seen:
                raise ValueError(f"cyclic substitution at {t.id}")
            return self.apply(self.map[t.id], _seen + (t.id,))
        return TCon(t.name, tuple(self.apply(a, _seen) for a in t.args))

    def compose(self, other):
        out = {k: self.apply(v) for k, v in other.map.items()}
        for k, v in self.map.items():
            out.setdefault(k, v)
        return Subst(out)

    def apply_scheme(self, sc):
        inner = Subst({k: v for k, v in self.map.items() if k not in sc.vars})
        clash = set()
        for k in ftv(sc.body) - set(sc.vars):
            if k in inner.map:
                clash |= ftv(inner.apply(TVar(k)))
        used = ftv(sc.body) | set(sc.vars) | set(inner.map) | clash
        for v in inner.map.values():
            used |= ftv(v)
        body, vars_ = sc.body, []
        nxt = max(used, default=-1) + 1
        ren = {}
        for v in sc.vars:
            if v in clash:
                ren[v] = TVar(nxt)
                vars_.append(nxt)
                nxt += 1
            else:
                vars_.append(v)
        if ren:
            body = Subst(ren).apply(body)
        return Scheme(tuple(vars_), inner.apply(body))

    def apply_env(self, env):
        return TypeEnv({k: self.apply_scheme(v) for k, v in env.items()})


# @id CODE-TYPES-005 @implements REQ-TYPES-005 REQ-TYPES-006
def generalize(env, t):
    return Scheme(tuple(sorted(ftv(t) - ftv(env))), t)


# @id CODE-TYPES-009 @implements REQ-TYPES-009
def rename_vars(t, m):
    if isinstance(t, TVar):
        return m.get(t.id, t)
    return TCon(t.name, tuple(rename_vars(a, m) for a in t.args))


def instantiate(scheme, supply):
    fresh = {v: supply.fresh() for v in scheme.vars}
    return rename_vars(scheme.body, fresh)


# @id CODE-TYPES-008 @implements REQ-TYPES-008
class Supply:
    def __init__(self, start=0):
        self.next = start

    def fresh(self):
        v = TVar(self.next)
        self.next += 1
        return v

    def reserve(self, t):
        ids = ftv(t)
        if ids:
            self.next = max(self.next, max(ids) + 1)
