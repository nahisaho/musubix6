class RetryPolicy:
    def __init__(self, base=1.0, factor=2.0, max_delay=60.0, max_attempts=3, retry_on=(Exception,)):
        self.base = base
        self.factor = factor
        self.max_delay = max_delay
        self.max_attempts = max_attempts
        self.retry_on = tuple(retry_on)

    # @id CODE-RETRY-003
    # @implements REQ-RETRY-003 REQ-RETRY-004
    def delay(self, attempt):
        return min(self.base * self.factor ** (attempt - 1), self.max_delay)

    # @id CODE-RETRY-005
    # @implements REQ-RETRY-005
    def should_retry(self, attempt):
        return attempt < self.max_attempts


# @id CODE-RETRY-010
# @implements REQ-RETRY-010
def no_retry_policy():
    return RetryPolicy(max_attempts=1)
