def tokenize(s):
    return s.split()
class Counter:
    n = 0
    def fresh(self):
        self.n += 1
        return self.n - 1
class Sub:
    def __init__(self, m): self.m = m
    def apply(self, x): return self.m[x]
