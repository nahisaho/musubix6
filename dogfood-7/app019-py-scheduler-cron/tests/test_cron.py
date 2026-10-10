from datetime import datetime, timezone
import pytest
from scheduler.cron import parse, matches, next_run

UTC = timezone.utc

# @id TEST-CRON-001 @verifies REQ-CRON-001
def test_cron_001():
    c = parse("*/15 1-3 1,15 * 0,7")
    assert c.minute == frozenset({0, 15, 30, 45})
    assert c.hour == frozenset({1, 2, 3})
    assert c.day == frozenset({1, 15})
    assert c.weekday == frozenset({0})

# @id TEST-CRON-002 @verifies REQ-CRON-002
def test_cron_002():
    for expr in ["* * * *", "60 * * * *", "* 24 * * *", "* * 0 * *",
                 "* * * 13 *", "* * * * 8", "*/0 * * * *", "4-2 * * * *", "x * * * *"]:
        with pytest.raises(ValueError):
            parse(expr)

# @id TEST-CRON-003 @verifies REQ-CRON-003
def test_cron_003():
    assert matches(parse("5 12 * 1 0"), datetime(2026, 1, 4, 12, 5, tzinfo=UTC))
    assert not matches(parse("5 12 * 1 0"), datetime(2026, 1, 5, 12, 5, tzinfo=UTC))
    assert not matches(parse("5 12 * 1 0"), datetime(2026, 1, 4, 12, 6, tzinfo=UTC))

# @id TEST-CRON-004 @verifies REQ-CRON-004
def test_cron_004():
    c = parse("0 0 15 * 0")
    assert matches(c, datetime(2026, 1, 4, tzinfo=UTC))
    assert matches(c, datetime(2026, 1, 15, tzinfo=UTC))
    assert not matches(c, datetime(2026, 1, 16, tzinfo=UTC))
    assert not matches(parse("0 0 15 * *"), datetime(2026, 1, 4, tzinfo=UTC))

# @id TEST-CRON-005 @verifies REQ-CRON-005
def test_cron_005():
    start = datetime(2026, 1, 1, 0, 0, 30, tzinfo=UTC)
    assert next_run(parse("*/5 * * * *"), start) == datetime(2026, 1, 1, 0, 5, tzinfo=UTC)
    assert next_run(parse("* * * * *"), start.replace(second=0)).minute == 1

# @id TEST-CRON-006 @verifies REQ-CRON-006
def test_cron_006():
    assert next_run(parse("30 2 * * *"), datetime(2026, 3, 8, 5, tzinfo=UTC),
                    "America/New_York") == datetime(2026, 3, 9, 6, 30, tzinfo=UTC)

# @id TEST-CRON-007 @verifies REQ-CRON-007
def test_cron_007():
    c = parse("30 1 * * *")
    start = datetime(2026, 11, 1, 4, tzinfo=UTC)
    first = datetime(2026, 11, 1, 5, 30, tzinfo=UTC)
    second = datetime(2026, 11, 1, 6, 30, tzinfo=UTC)
    assert next_run(c, start, "America/New_York", "first") == first
    assert next_run(c, start, "America/New_York", "second") == second
    assert next_run(c, first, "America/New_York", "both") == second
    assert next_run(c, first, "America/New_York", "first").day == 2

# @id TEST-CRON-008 @verifies REQ-CRON-008
def test_cron_008():
    c = parse("0 0 31 2 *")
    start = datetime(2026, 1, 1, tzinfo=UTC)
    for kwargs in [{"zone": "No/SuchZone"}, {"fold": "bad"}, {"max_minutes": 0}]:
        with pytest.raises(ValueError):
            next_run(c, start, **kwargs)
    with pytest.raises(ValueError):
        next_run(c, start.replace(tzinfo=None))
    with pytest.raises(LookupError):
        next_run(c, start, max_minutes=1440)
