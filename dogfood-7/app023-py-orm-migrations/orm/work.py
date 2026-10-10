from contextlib import contextmanager
from orm.model import identifier
from orm.query import Query


# @id CODE-WORK-001 @implements REQ-WORK-001 REQ-WORK-006
class Session:
    def __init__(self, connection):
        self.connection = connection
        self.identity = {}
        self.snapshots = {}
        self.pending = []
        self.deleted = set()
        self.select_count = 0
        self._context = False

    def hydrate(self, model, row):
        values = dict(zip(model.fields, row))
        key = (model, values[model.pk])
        if key not in self.identity:
            obj = model(**values)
            obj._session = self
            self.identity[key] = obj
            self.snapshots[obj] = obj.to_dict()
        return self.identity[key]

    def all(self, query):
        return [self.hydrate(query.model, row) for row in self.select(query)]

    def select(self, query):
        sql, parameters = query.compile()
        self.select_count += 1
        return self.connection.execute(sql, parameters).fetchall()

    def get(self, model, key):
        if (model, key) in self.identity:
            return self.identity[(model, key)]
        rows = self.all(Query(model).where(**{model.pk: key}).limit(1))
        return rows[0] if rows else None

    # @id CODE-WORK-002 @implements REQ-WORK-002 REQ-WORK-003 REQ-WORK-004 REQ-WORK-005 REQ-WORK-010 REQ-WORK-011
    def add(self, obj):
        if obj._session is not None and obj._session is not self:
            raise ValueError("object belongs to another session")
        if obj in self.pending or obj in self.snapshots:
            return
        obj._session = self
        self.pending.append(obj)

    def delete(self, obj):
        if obj._session is not self:
            raise ValueError("object belongs to another session")
        if obj in self.pending:
            self.pending.remove(obj)
            obj._session = None
        else:
            self.deleted.add(obj)

    def _flush(self):
        if self.connection.in_transaction:
            raise RuntimeError("external database transaction")
        original_keys = {obj: getattr(obj, obj.pk) for obj in self.pending}
        try:
            self.connection.execute("BEGIN")
            for obj in self.pending:
                names = [name for name in obj.fields if name != obj.pk or getattr(obj, name) is not None]
                if names:
                    sql = (f"INSERT INTO {identifier(obj.table)} "
                           f"({', '.join(map(identifier, names))}) VALUES ({', '.join('?' for _ in names)})")
                    cursor = self.connection.execute(sql, [getattr(obj, name) for name in names])
                else:
                    cursor = self.connection.execute(f"INSERT INTO {identifier(obj.table)} DEFAULT VALUES")
                if getattr(obj, obj.pk) is None:
                    setattr(obj, obj.pk, cursor.lastrowid)
            for obj, before in self.snapshots.items():
                if obj in self.deleted:
                    self.connection.execute(
                        f"DELETE FROM {identifier(obj.table)} WHERE {identifier(obj.pk)} = ?", (before[obj.pk],))
                elif obj.to_dict() != before:
                    if getattr(obj, obj.pk) != before[obj.pk]:
                        raise ValueError("primary key is immutable")
                    names = [name for name in obj.fields if name != obj.pk]
                    if names:
                        self.connection.execute(
                            f"UPDATE {identifier(obj.table)} SET " +
                            ", ".join(f"{identifier(name)} = ?" for name in names) +
                            f" WHERE {identifier(obj.pk)} = ?",
                            [getattr(obj, name) for name in names] + [before[obj.pk]])
            self.connection.execute("COMMIT")
        except BaseException:
            if self.connection.in_transaction:
                self.connection.execute("ROLLBACK")
            for obj, key in original_keys.items():
                setattr(obj, obj.pk, key)
            self.rollback()
            raise
        for obj in self.deleted:
            self.identity.pop((type(obj), self.snapshots[obj][obj.pk]), None)
            self.snapshots.pop(obj)
            obj._session = None
        for obj in self.pending:
            self.identity[(type(obj), getattr(obj, obj.pk))] = obj
        self.snapshots = {obj: obj.to_dict() for obj in self.identity.values()}
        self.pending.clear()
        self.deleted.clear()

    # @id CODE-WORK-003 @implements REQ-WORK-007 REQ-WORK-008 REQ-WORK-009
    def rollback(self):
        for obj, values in self.snapshots.items():
            obj._values = values.copy()
        for obj in self.pending:
            obj._session = None
        self.pending.clear()
        self.deleted.clear()

    def commit(self):
        if self._context:
            raise RuntimeError("explicit commit forbidden inside transaction context")
        self._flush()

    @contextmanager
    def transaction(self):
        if self._context:
            raise RuntimeError("nested transaction")
        self._context = True
        try:
            yield self
            self._flush()
        except BaseException:
            self.rollback()
            raise
        finally:
            self._context = False
