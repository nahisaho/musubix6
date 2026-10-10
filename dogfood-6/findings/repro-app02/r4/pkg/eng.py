class Eng:
    def __init__(self, *a, **k):
        pass

    def run(self, *a, **k):
        raise NotImplementedError("run")

    def count(self, *a, **k):
        raise NotImplementedError("count")
