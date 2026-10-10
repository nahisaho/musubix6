def identity(x: T) -> T:
    return x


number = identity(42)
text = identity("hello")
optional: int | None = None
if optional is not None and isinstance(optional, int):
    result: int = optional + 1

matrix: list[list[int]] = [[]]
