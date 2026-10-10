from datetime import datetime, timezone
from scheduler.cron import parse, matches

# @id TEST-CRON-009 @verifies REQ-CRON-009
def test_cron_009():
    sunday = datetime(2026, 1, 4, tzinfo=timezone.utc)
    monday = datetime(2026, 1, 5, tzinfo=timezone.utc)
    assert matches(parse("0 0 */1 * 0"), sunday)
    assert not matches(parse("0 0 */1 * 0"), monday)
    assert not matches(parse("0 0 15 * */1"), sunday)
