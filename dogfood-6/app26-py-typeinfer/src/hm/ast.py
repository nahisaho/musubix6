from dataclasses import dataclass, field
from typing import Any, Optional, Tuple

Pos = Optional[Tuple[int, int]]


def _pos():
    return field(default=None, compare=False)


@dataclass(frozen=True)
class Var:
    name: str
    pos: Pos = _pos()


@dataclass(frozen=True)
class Lit:
    value: Any
    pos: Pos = _pos()


@dataclass(frozen=True)
class Lam:
    param: str
    body: Any
    pos: Pos = _pos()


@dataclass(frozen=True)
class App:
    fn: Any
    arg: Any
    pos: Pos = _pos()


@dataclass(frozen=True)
class Let:
    name: str
    value: Any
    body: Any
    rec: bool = False
    pos: Pos = _pos()


@dataclass(frozen=True)
class If:
    cond: Any
    then: Any
    other: Any
    pos: Pos = _pos()


@dataclass(frozen=True)
class Pair:
    left: Any
    right: Any
    pos: Pos = _pos()
