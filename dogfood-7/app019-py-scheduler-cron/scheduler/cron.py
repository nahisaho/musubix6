from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


@dataclass(frozen=True)
class Cron:
    minute: frozenset
    hour: frozenset
    day: frozenset
    month: frozenset
    weekday: frozenset
    day_any: bool
    weekday_any: bool


def _field(text, low, high):
    values = set()
    for part in text.split(","):
        base, *steps = part.split("/")
        if len(steps) > 1:
            raise ValueError("invalid step")
        step = int(steps[0]) if steps else 1
        if step <= 0:
            raise ValueError("step must be positive")
        if base == "*":
            start, end = low, high
        elif "-" in base:
            start, end = map(int, base.split("-"))
        else:
            start = int(base)
            end = high if steps else start
        if not low <= start <= end <= high:
            raise ValueError("field outside range")
        values.update(range(start, end + 1, step))
    return frozenset(values)


# @id CODE-CRON-001 @implements REQ-CRON-001 REQ-CRON-002 REQ-CRON-009
def parse(expression):
    if not isinstance(expression, str) or len(expression.split()) != 5:
        raise ValueError("expected five cron fields")
    parts = expression.split()
    fields = [_field(p, *limits) for p, limits in zip(parts, [(0, 59), (0, 23), (1, 31), (1, 12), (0, 7)])]
    fields[4] = frozenset(x % 7 for x in fields[4])
    return Cron(*fields, parts[2].startswith("*"), parts[4].startswith("*"))


# @id CODE-CRON-002 @implements REQ-CRON-003 REQ-CRON-004 REQ-CRON-009
def matches(cron, local):
    day = local.day in cron.day
    weekday = (local.weekday() + 1) % 7 in cron.weekday
    calendar = day and weekday if cron.day_any or cron.weekday_any else day or weekday
    return local.minute in cron.minute and local.hour in cron.hour and local.month in cron.month and calendar


def _fold_allowed(local, policy):
    ambiguous = local.replace(fold=0).utcoffset() != local.replace(fold=1).utcoffset()
    return not ambiguous or policy == "both" or local.fold == (policy == "second")


# @id CODE-CRON-003 @implements REQ-CRON-005 REQ-CRON-006 REQ-CRON-007 REQ-CRON-008
def next_run(cron, after, zone="UTC", fold="both", max_minutes=366 * 1440):
    if not isinstance(after, datetime) or after.utcoffset() is None:
        raise ValueError("after must be timezone-aware")
    if fold not in ("first", "second", "both") or not isinstance(max_minutes, int) or max_minutes <= 0:
        raise ValueError("invalid search policy")
    try:
        tz = ZoneInfo(zone)
    except (ZoneInfoNotFoundError, TypeError, ValueError) as error:
        raise ValueError("invalid timezone") from error
    candidate = after.astimezone(timezone.utc).replace(second=0, microsecond=0) + timedelta(minutes=1)
    for _ in range(max_minutes):
        local = candidate.astimezone(tz)
        if _fold_allowed(local, fold) and matches(cron, local):
            return candidate
        candidate += timedelta(minutes=1)
    raise LookupError("no cron occurrence inside search horizon")
