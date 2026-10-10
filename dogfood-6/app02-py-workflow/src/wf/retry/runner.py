class RetriesExhausted(Exception):
    def __init__(self, attempts, last_error):
        super().__init__(f"gave up after {attempts} attempts: {last_error}")
        self.attempts = attempts
        self.last_error = last_error


# @id CODE-RETRY-006
# @implements REQ-RETRY-006 REQ-RETRY-007 REQ-RETRY-008 REQ-RETRY-009
def run_with_retry(fn, policy, clock, on_retry=None):
    attempt = 0
    while True:
        attempt += 1
        try:
            return fn()
        except policy.retry_on as err:
            if not policy.should_retry(attempt):
                raise RetriesExhausted(attempt, err) from err
            delay = policy.delay(attempt)
            if on_retry:
                on_retry(attempt, err, delay)
            clock.sleep(delay)
