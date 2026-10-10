from datetime import datetime, timedelta, timezone
import pytest
from scheduler.queue import create_queue, push, pop, size

# @id TEST-QUEUE-009 @verifies REQ-QUEUE-009
def test_queue_009():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    later = start + timedelta(seconds=10)
    q = create_queue()
    push(q, "a", later)
    push(q, "b", later)
    assert pop(q, later).id == "a"
    with pytest.raises(ValueError, match="monotonic"):
        pop(q, start)
    assert size(q) == 1
    assert pop(q, later).id == "b"
