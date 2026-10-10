from dataclasses import dataclass, field
from threading import RLock
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from scheduler.clock import now, utc, duration
from scheduler.cron import parse, next_run
from scheduler.leases import create_store, acquire, valid, release
from scheduler.queue import create_queue, push, pop, discard


TRANSITIONS = {
    "pending": {"start": "running", "cancel": "cancelled"},
    "running": {"success": "succeeded", "retry": "pending", "reschedule": "pending",
                "recover": "pending", "exhaust": "dead", "cancel": "cancelled"},
    "succeeded": {},
    "dead": {},
    "cancelled": {},
}


@dataclass
class Job:
    id: str
    due: object
    priority: int
    max_attempts: int
    base_delay: float
    max_delay: float
    cron: object = None
    zone: str = "UTC"
    state: str = "pending"
    attempt: int = 0
    lease: object = None


@dataclass(frozen=True)
class Run:
    id: str
    attempt: int
    lease: object


@dataclass
class Scheduler:
    clock: object
    ttl: float
    leases: object
    queue: object
    jobs: dict = field(default_factory=dict)
    lock: object = field(default_factory=RLock)


def _transition(job, event):
    job.state = TRANSITIONS[job.state][event]


def _enqueue(scheduler, job):
    push(scheduler.queue, job.id, job.due, job.priority)


# @id CODE-DISPATCH-001 @implements REQ-DISPATCH-001 REQ-DISPATCH-008
def create_scheduler(clock, ttl=30):
    duration(ttl, positive=True)
    return Scheduler(clock, ttl, create_store(clock), create_queue())


# @id CODE-DISPATCH-002 @implements REQ-DISPATCH-003 REQ-DISPATCH-008 REQ-DISPATCH-009
def retry_delay(attempt, base_delay, max_delay):
    duration(base_delay)
    duration(max_delay)
    if isinstance(attempt, bool) or not isinstance(attempt, int) or attempt < 1:
        raise ValueError("attempt must be a positive integer")
    delay = min(base_delay, max_delay)
    if delay == 0:
        return delay
    for _ in range(attempt - 1):
        if delay >= max_delay / 2:
            return max_delay
        delay *= 2
    return delay


# @id CODE-DISPATCH-003 @implements REQ-DISPATCH-001 REQ-DISPATCH-006 REQ-DISPATCH-008
def submit(scheduler, id, due, priority=0, max_attempts=3, base_delay=1, max_delay=60, cron=None, zone="UTC"):
    due = utc(due)
    if not isinstance(id, str) or not id or isinstance(priority, bool) or not isinstance(priority, int):
        raise ValueError("invalid job identity or priority")
    if isinstance(max_attempts, bool) or not isinstance(max_attempts, int) or max_attempts < 1:
        raise ValueError("invalid attempt limit")
    retry_delay(1, base_delay, max_delay)
    expression = parse(cron) if cron is not None else None
    try:
        ZoneInfo(zone)
    except (ZoneInfoNotFoundError, TypeError, ValueError) as error:
        raise ValueError("invalid timezone") from error
    job = Job(id, due, priority, max_attempts, base_delay, max_delay, expression, zone)
    with scheduler.lock:
        if id in scheduler.jobs:
            raise ValueError("duplicate job")
        scheduler.jobs[id] = job
        _enqueue(scheduler, job)
    return job


# @id CODE-DISPATCH-004 @implements REQ-DISPATCH-001 REQ-DISPATCH-004 REQ-DISPATCH-005
def poll(scheduler, owner):
    if not isinstance(owner, str) or not owner:
        raise ValueError("invalid worker")
    with scheduler.lock:
        instant = now(scheduler.clock)
        for job in scheduler.jobs.values():
            if job.state == "running" and not valid(scheduler.leases, job.lease):
                job.lease = None
                if job.attempt >= job.max_attempts:
                    _transition(job, "exhaust")
                else:
                    job.due = instant
                    _transition(job, "recover")
                    _enqueue(scheduler, job)
        blocked = []
        try:
            while (work := pop(scheduler.queue, instant)) is not None:
                job = scheduler.jobs[work.id]
                lease = acquire(scheduler.leases, job.id, owner, scheduler.ttl)
                if lease is None:
                    blocked.append(job)
                    continue
                job.attempt += 1
                job.lease = lease
                _transition(job, "start")
                return Run(job.id, job.attempt, lease)
            return None
        finally:
            for job in blocked:
                _enqueue(scheduler, job)


# @id CODE-DISPATCH-005 @implements REQ-DISPATCH-002 REQ-DISPATCH-003 REQ-DISPATCH-004 REQ-DISPATCH-005 REQ-DISPATCH-006 REQ-DISPATCH-010
def complete(scheduler, run, success, permanent=False):
    with scheduler.lock:
        job = scheduler.jobs.get(run.id)
        if (not job or job.state != "running" or job.attempt != run.attempt
                or job.lease.token != run.lease.token or not valid(scheduler.leases, run.lease)):
            return False
        if success:
            due = next_run(job.cron, now(scheduler.clock), job.zone, max_minutes=8 * 366 * 1440) if job.cron else None
            event = "reschedule" if job.cron else "success"
        elif permanent or job.attempt >= job.max_attempts:
            due, event = None, "exhaust"
        else:
            due = now(scheduler.clock) + duration(retry_delay(job.attempt, job.base_delay, job.max_delay))
            event = "retry"
        release(scheduler.leases, run.lease)
        job.lease = None
        _transition(job, event)
        if due is not None:
            job.due = due
            if event == "reschedule":
                job.attempt = 0
            _enqueue(scheduler, job)
        return True


# @id CODE-DISPATCH-006 @implements REQ-DISPATCH-007
def cancel_job(scheduler, id):
    with scheduler.lock:
        job = scheduler.jobs.get(id)
        if not job or "cancel" not in TRANSITIONS[job.state]:
            return False
        discard(scheduler.queue, id)
        if job.lease:
            release(scheduler.leases, job.lease)
            job.lease = None
        _transition(job, "cancel")
        return True
