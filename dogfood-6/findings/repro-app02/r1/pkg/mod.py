class Box:
    def __init__(self, *a, **k):
        pass

    def put(self, *a, **k):
        raise NotImplementedError("put")


class Color:
    def __init__(self, *a, **k):
        pass


def helper(*a, **k):
    raise NotImplementedError("helper")
