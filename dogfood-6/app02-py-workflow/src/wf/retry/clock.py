class FakeClock:
    # @id CODE-RETRY-001
    # @implements REQ-RETRY-001 REQ-RETRY-002
    def __init__(self, start=0.0):
        self._now = start

    def now(self):
        return self._now

    def sleep(self, seconds):
        if seconds < 0:
            raise ValueError("negative sleep")
        self._now += seconds
