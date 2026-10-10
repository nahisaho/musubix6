from .types import TVar, Subst, ftv


class UnifyError(Exception):
    def __init__(self, kind, left, right, culprit=None, var=None, type=None, index=None):
        super().__init__(f"{kind}: cannot unify {left} with {right}")
        self.kind = kind
        self.left = left
        self.right = right
        self.culprit = culprit if culprit is not None else (left, right)
        self.var = var
        self.type = type
        self.index = index


# @id CODE-UNIFY-001 @implements REQ-UNIFY-001 REQ-UNIFY-002 REQ-UNIFY-003 REQ-UNIFY-004 REQ-UNIFY-005
def _go(l, r, s):
    l, r = s.apply(l), s.apply(r)
    if l == r:
        return s
    for v, t in ((l, r), (r, l)):
        if isinstance(v, TVar):
            if v.id in ftv(t):
                raise UnifyError("occurs", l, r, (v, t), var=v, type=t)
            return Subst({v.id: t}).compose(s)
    if l.name != r.name or len(l.args) != len(r.args):
        raise UnifyError("mismatch", l, r)
    for x, y in zip(l.args, r.args):
        s = _go(x, y, s)
    return s


# @id CODE-UNIFY-006 @implements REQ-UNIFY-006 REQ-UNIFY-007 REQ-UNIFY-009
def unify(l, r, subst=None):
    try:
        return _go(l, r, subst or Subst())
    except UnifyError as e:
        e.left, e.right = l, r
        raise


# @id CODE-UNIFY-008 @implements REQ-UNIFY-008
def unify_all(pairs):
    s = Subst()
    for i, (l, r) in enumerate(pairs):
        try:
            s = unify(l, r, s)
        except UnifyError as e:
            e.index = i
            raise
    return s
