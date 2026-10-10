from orm.query import Query


# @id CODE-RELATION-001 @implements REQ-RELATION-001 REQ-RELATION-002 REQ-RELATION-005 REQ-RELATION-006 REQ-RELATION-007 REQ-RELATION-009 REQ-RELATION-010
class Relationship:
    def __init__(self, session, parent_model, child_model, foreign_key):
        if foreign_key not in child_model.fields:
            raise ValueError("unknown relationship field")
        if child_model.fields[foreign_key].kind is not parent_model.fields[parent_model.pk].kind:
            raise ValueError("incompatible relationship field")
        self.session = session
        self.parent_model = parent_model
        self.child_model = child_model
        self.foreign_key = foreign_key
        self.cache = {}

    def _validate(self, obj, model):
        if type(obj) is not model or obj._session is not self.session:
            raise ValueError("relationship object must belong to this session")

    def parent(self, child):
        self._validate(child, self.child_model)
        key = getattr(child, self.foreign_key)
        if child not in self.cache or self.cache[child][0] != key:
            parent = None if key is None else self.session.get(self.parent_model, key)
            self.cache[child] = (key, parent)
        return self.cache[child][1]

    # @id CODE-RELATION-002 @implements REQ-RELATION-003 REQ-RELATION-008 REQ-RELATION-011
    def children(self, parent):
        self._validate(parent, self.parent_model)
        return self.session.all(Query(self.child_model).where(
            **{self.foreign_key: getattr(parent, parent.pk)}).order_by(self.child_model.pk))

    def prefetch_children(self, parents):
        parents = list(parents)
        for parent in parents:
            self._validate(parent, self.parent_model)
        grouped = {getattr(parent, parent.pk): [] for parent in parents}
        if grouped:
            rows = self.session.select(Query(self.child_model).where(
                **{self.foreign_key + "__in": tuple(grouped)}).order_by(self.child_model.pk))
            foreign_index = list(self.child_model.fields).index(self.foreign_key)
            for row in rows:
                child = self.session.hydrate(self.child_model, row)
                grouped[row[foreign_index]].append(child)
        return grouped

    # @id CODE-RELATION-003 @implements REQ-RELATION-004
    def prefetch_parents(self, children):
        children = list(children)
        for child in children:
            self._validate(child, self.child_model)
        keys = sorted({getattr(child, self.foreign_key) for child in children
                       if getattr(child, self.foreign_key) is not None})
        parents = self.session.all(Query(self.parent_model).where(
            **{self.parent_model.pk + "__in": keys})) if keys else []
        by_key = {getattr(parent, parent.pk): parent for parent in parents}
        for child in children:
            key = getattr(child, self.foreign_key)
            self.cache[child] = (key, by_key.get(key))
