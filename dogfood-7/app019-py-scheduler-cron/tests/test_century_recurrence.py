from datetime import datetime, timezone
from scheduler.clock import create_clock, advance
from scheduler.dispatch import create_scheduler, submit, poll, complete

# @id TEST-DISPATCH-011 @verifies REQ-DISPATCH-010
def test_dispatch_011():
    start = datetime(2096, 2, 29, tzinfo=timezone.utc)
    expected = datetime(2104, 2, 29, tzinfo=timezone.utc)
    clock = create_clock(start)
    s = create_scheduler(clock)
    submit(s, "century", start, cron="0 0 29 2 *")
    assert complete(s, poll(s, "worker"), True)
    job = s.jobs["century"]
    assert job.due == expected
    assert job.state == "pending" and job.attempt == 0 and job.lease is None
    advance(clock, (expected - start).total_seconds())
    run = poll(s, "worker")
    assert run.id == "century" and run.attempt == 1
