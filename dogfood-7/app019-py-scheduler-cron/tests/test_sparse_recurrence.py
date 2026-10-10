from datetime import datetime, timezone
from scheduler.clock import create_clock
from scheduler.dispatch import create_scheduler, submit, poll, complete

# @id TEST-DISPATCH-010 @verifies REQ-DISPATCH-010
def test_dispatch_010():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    s = create_scheduler(create_clock(start))
    submit(s, "leap", start, cron="0 0 29 2 *")
    run = poll(s, "worker")
    assert complete(s, run, True)
    assert s.jobs["leap"].state == "pending"
    assert s.jobs["leap"].due == datetime(2028, 2, 29, tzinfo=timezone.utc)
