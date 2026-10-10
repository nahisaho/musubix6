from dataclasses import dataclass
from fractions import Fraction


def rational(value):
    if not isinstance(value, (int, str, Fraction)) or isinstance(value, bool):
        raise TypeError("exact rational required; floats are unsupported")
    return Fraction(value)


# @id CODE-TERMS-001 @implements REQ-TERMS-001 REQ-TERMS-002 REQ-TERMS-007
@dataclass(frozen=True)
class Term:
    symbol: str
    args: tuple = ()

    def __post_init__(self):
        if not isinstance(self.symbol, str) or not self.symbol:
            raise ValueError("nonempty symbol required")
        args = tuple(self.args)
        if not all(isinstance(arg, Term) for arg in args):
            raise TypeError("function arguments must be ground terms")
        object.__setattr__(self, "args", args)

    def __str__(self):
        return self.symbol if not self.args else f'{self.symbol}({",".join(map(str, self.args))})'


# @id CODE-TERMS-002 @implements REQ-TERMS-003 REQ-TERMS-004 REQ-TERMS-005 REQ-TERMS-007 REQ-TERMS-008
@dataclass(frozen=True, init=False)
class Linear:
    coeffs: tuple
    constant: Fraction

    def __init__(self, coeffs=None, constant=0):
        normalized = []
        for name, value in (coeffs or {}).items():
            if not isinstance(name, str) or not name:
                raise ValueError("nonempty real variable name required")
            value = rational(value)
            if value:
                normalized.append((name, value))
        object.__setattr__(self, "coeffs", tuple(sorted(normalized)))
        object.__setattr__(self, "constant", rational(constant))

    def __add__(self, other):
        if not isinstance(other, Linear):
            return NotImplemented
        coeffs = dict(self.coeffs)
        for name, value in other.coeffs:
            coeffs[name] = coeffs.get(name, Fraction(0)) + value
        return Linear(coeffs, self.constant + other.constant)

    def __mul__(self, scalar):
        scalar = rational(scalar)
        return Linear({name: value * scalar for name, value in self.coeffs},
                      self.constant * scalar)

    __rmul__ = __mul__

    def evaluate(self, model):
        return self.constant + sum(value * model.get(name, Fraction(0))
                                   for name, value in self.coeffs)


# @id CODE-TERMS-003 @implements REQ-TERMS-006 REQ-TERMS-008
@dataclass(frozen=True)
class Relation:
    expression: Linear
    op: str

    def __post_init__(self):
        if not isinstance(self.expression, Linear):
            raise TypeError("linear expression required")
        if self.op not in ("le", "ge", "eq", "lt", "gt"):
            raise ValueError("unsupported relation")

    def holds(self, model):
        value = self.expression.evaluate(model)
        return {"le": value <= 0, "ge": value >= 0, "eq": value == 0,
                "lt": value < 0, "gt": value > 0}[self.op]
