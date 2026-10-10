import re
from types import MappingProxyType


def identifier(name):
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
        raise ValueError(f"invalid identifier: {name!r}")
    return f'"{name}"'


# @id CODE-MODEL-001 @implements REQ-MODEL-003 REQ-MODEL-004 REQ-MODEL-005
class Field:
    def __init__(self, kind, *, nullable=False, default=None, primary_key=False):
        if kind not in (int, str, float, bytes):
            raise TypeError("unsupported field type")
        if primary_key and kind is not int:
            raise ValueError("primary key must be integer")
        self.kind = kind
        self.nullable = nullable or primary_key
        self.default = default
        self.primary_key = primary_key
        self.name = None

    def __set_name__(self, owner, name):
        identifier(name)
        self.name = name

    def __get__(self, instance, owner=None):
        return self if instance is None else instance._values[self.name]

    def __set__(self, instance, value):
        if value is None:
            if not self.nullable:
                raise ValueError(f"{self.name} cannot be None")
        elif type(value) is not self.kind:
            raise TypeError(f"{self.name} requires {self.kind.__name__}")
        instance._values[self.name] = value


# @id CODE-MODEL-002 @implements REQ-MODEL-001 REQ-MODEL-002 REQ-MODEL-007 REQ-MODEL-009
class ModelMeta(type):
    def __new__(mcls, name, bases, namespace):
        fields = {}
        for base in bases:
            fields.update(getattr(base, "fields", {}))
        fields.update({key: value for key, value in namespace.items() if isinstance(value, Field)})
        cls = super().__new__(mcls, name, bases, namespace)
        fields = {key: getattr(cls, key) for key in fields}
        if any(not isinstance(field, Field) for field in fields.values()):
            raise ValueError("inherited field cannot be shadowed by a non-field")
        if fields and sum(field.primary_key for field in fields.values()) != 1:
            raise ValueError("model requires exactly one primary key")
        cls.fields = MappingProxyType(fields)
        cls.table = namespace.get("table", name.lower())
        identifier(cls.table)
        cls.pk = next((key for key, value in fields.items() if value.primary_key), None)
        return cls


# @id CODE-MODEL-003 @implements REQ-MODEL-006 REQ-MODEL-008
class Model(metaclass=ModelMeta):
    def __init__(self, **values):
        unknown = values.keys() - self.fields.keys()
        if unknown:
            raise TypeError(f"unknown fields: {sorted(unknown)}")
        self._values = {}
        self._session = None
        for name, field in self.fields.items():
            value = values[name] if name in values else (
                field.default() if callable(field.default) else field.default)
            setattr(self, name, value)

    def to_dict(self):
        return self._values.copy()
