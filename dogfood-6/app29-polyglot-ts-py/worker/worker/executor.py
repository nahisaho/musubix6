from worker.retry import backoff, should_retry, PermanentError
from worker.states import can_transition


class JobTimeout(Exception):
    pass


class Cancelled(Exception):
    pass


# @id CODE-EXE-001
# @implements REQ-EXE-001, REQ-EXE-003
class JobRecord:
    def __init__(self, id, type, payload, max_attempts):
        self.id = id
        self.type = type
        self.payload = payload
        self.max_attempts = max_attempts
        self.state = "queued"
        self.attempts = 0
        self.result = None
        self.reason = None
        self.delay = None
        self.history = ["queued"]
        self.error = None


class Context:
    def __init__(self, executor, job_id, started):
        self._ex = executor
        self._id = job_id
        self._started = started

    def check(self):
        if self._id in self._ex._cancelled:
            raise Cancelled(self._id)
        if self._ex._clock() - self._started > self._ex._timeout:
            raise JobTimeout(self._id)


# @id CODE-EXE-002
# @implements REQ-EXE-001, REQ-EXE-002, REQ-EXE-004, REQ-EXE-005, REQ-EXE-006, REQ-EXE-007, REQ-EXE-008, REQ-EXE-009, REQ-EXE-010, REQ-EXE-012
class Executor:
    def __init__(self, clock, sleep, base=1.0, cap=60.0, timeout=30.0, mode="none", seed=None, budget=None, dlq=None):
        self._clock = clock
        self._sleep = sleep
        self._base = base
        self._cap = cap
        self._timeout = timeout
        self._mode = mode
        self._seed = seed
        self._budget = budget
        self._dlq = dlq
        self._handlers = {}
        self._cancelled = set()

    def register(self, type, fn):
        if type in self._handlers:
            raise ValueError(f"handler already registered: {type}")
        self._handlers[type] = fn

    def cancel(self, job_id):
        self._cancelled.add(job_id)

    def _move(self, job, to):
        if not can_transition(job.state, to):
            raise RuntimeError(f"illegal transition {job.state} -> {to}")
        job.state = to
        job.history.append(to)

    def _fail(self, job, reason, retry):
        self._move(job, "failed")
        job.reason = reason
        if retry and self._budget is not None and not self._budget.consume():
            retry, job.reason = False, "budget_exhausted"
        if retry:
            self._move(job, "retrying")
            job.delay = backoff(job.attempts, self._base, self._cap, self._mode, self._seed)
        else:
            self._move(job, "dead")
            job.delay = None
            if self._dlq is not None:
                self._dlq.add(job.id, job.attempts, job.error or job.reason)

    def run_attempt(self, job):
        if job.id in self._cancelled:
            self._move(job, "cancelled")
            job.reason = "cancelled"
            return job
        handler = self._handlers.get(job.type)
        self._move(job, "running")
        job.attempts += 1
        if handler is None:
            self._fail(job, "no_handler", False)
            return job
        ctx = Context(self, job.id, self._clock())
        try:
            job.result = handler(ctx, job.payload)
        except Cancelled:
            self._move(job, "cancelled")
            job.reason = "cancelled"
            job.delay = None
        except PermanentError as e:
            job.error = str(e)
            self._fail(job, "permanent", False)
        except Exception as e:
            job.error = str(e)
            reason = "timeout" if isinstance(e, JobTimeout) else "error"
            if should_retry(job.attempts, job.max_attempts, e):
                self._fail(job, reason, True)
            else:
                self._fail(job, "exhausted", False)
        else:
            self._move(job, "succeeded")
            job.reason = "ok"
            job.delay = None
            if self._budget is not None:
                self._budget.on_success()
        return job

    # @id CODE-EXE-003
    # @implements REQ-EXE-011
    def run_until_done(self, job):
        while job.state in ("queued", "retrying"):
            if job.delay:
                self._sleep(job.delay)
            self.run_attempt(job)
        return job
