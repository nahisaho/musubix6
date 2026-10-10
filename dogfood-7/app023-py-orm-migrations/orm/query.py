from dataclasses import dataclass, replace
from types import MappingProxyType
from orm.model import identifier


OPERATORS = MappingProxyType({"eq": "=", "ne": "!=", "gt": ">", "lt": "<", "ge": ">=", "le": "<="})


# @id CODE-QUERY-001 @implements REQ-QUERY-001 REQ-QUERY-007 REQ-QUERY-008
@dataclass(frozen=True)
class Query:
    model: type
    predicates: tuple = ()
    parameters: tuple = ()
    ordering: tuple = ()
    maximum: int | None = None

    def compile(self):
        columns = ", ".join(identifier(name) for name in self.model.fields)
        sql = f"SELECT {columns} FROM {identifier(self.model.table)}"
        if self.predicates:
            sql += " WHERE " + " AND ".join(self.predicates)
        if self.ordering:
            sql += " ORDER BY " + ", ".join(self.ordering)
        parameters = self.parameters
        if self.maximum is not None:
            sql += " LIMIT ?"
            parameters += (self.maximum,)
        return sql, parameters

    # @id CODE-QUERY-002 @implements REQ-QUERY-002 REQ-QUERY-003 REQ-QUERY-005 REQ-QUERY-006
    def where(self, **conditions):
        predicates, parameters = list(self.predicates), list(self.parameters)
        for key, value in conditions.items():
            field, separator, operator = key.partition("__")
            operator = operator if separator else "eq"
            if field not in self.model.fields or operator not in (*OPERATORS, "in"):
                raise ValueError(f"unsupported filter: {key}")
            column = identifier(field)
            if operator == "in":
                values = tuple(value)
                predicates.append(column + " IN (" + ", ".join("?" for _ in values) + ")" if values else "0 = 1")
                parameters.extend(values)
            elif value is None:
                if operator not in ("eq", "ne"):
                    raise ValueError("NULL supports only eq/ne")
                predicates.append(column + (" IS NULL" if operator == "eq" else " IS NOT NULL"))
            else:
                predicates.append(f"{column} {OPERATORS[operator]} ?")
                parameters.append(value)
        return replace(self, predicates=tuple(predicates), parameters=tuple(parameters))

    # @id CODE-QUERY-003 @implements REQ-QUERY-004
    def order_by(self, *names):
        ordering = []
        for name in names:
            field = name[1:] if name.startswith("-") else name
            if field not in self.model.fields:
                raise ValueError(f"unknown ordering: {name}")
            ordering.append(identifier(field) + (" DESC" if name.startswith("-") else " ASC"))
        return replace(self, ordering=tuple(ordering))

    def limit(self, maximum):
        if type(maximum) is not int or maximum < 0:
            raise ValueError("limit must be a nonnegative integer")
        return replace(self, maximum=maximum)
