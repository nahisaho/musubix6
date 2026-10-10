from dataclasses import asdict
import hashlib
import json
import math
from .engine import Engine
from .clock import Event
from .windows import tumbling, sliding
from decimal import Decimal


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate(payload, engine):
    if not isinstance(payload["dropped"], int) or isinstance(payload["dropped"], bool) or payload["dropped"] < 0:
        raise ValueError("invalid drop counter")
    if not isinstance(payload["windows"], list) or not isinstance(payload["late"], list) or not isinstance(payload["sessions"], dict):
        raise ValueError("invalid checkpoint containers")
    seen = set()
    session_rows = set()
    for row in payload["windows"]:
        key, start, end, aggregate = row["key"], row["start"], row["end"], row["aggregate"]
        if not isinstance(key, str) or not number(start) or not number(end) or start >= end or end <= engine.watermark:
            raise ValueError("invalid open interval")
        identity = (key, start, end)
        if identity in seen:
            raise ValueError("duplicate interval")
        seen.add(identity)
        if (not isinstance(aggregate, dict) or set(aggregate) != {"count", "sum", "min", "max"}
                or not isinstance(aggregate["count"], int) or isinstance(aggregate["count"], bool)
                or aggregate["count"] <= 0 or any(not number(aggregate[n]) for n in ("sum", "min", "max"))
                or aggregate["min"] > aggregate["max"]):
            raise ValueError("invalid aggregate")
        count = aggregate["count"]
        low, high = Decimal(str(aggregate["min"])) * count, Decimal(str(aggregate["max"])) * count
        total = Decimal(str(aggregate["sum"]))
        tolerance = max(abs(low), abs(high), abs(total), Decimal(1)) * Decimal("1e-12")
        if total < low - tolerance or total > high + tolerance:
            raise ValueError("inconsistent aggregate")
        if count == 1 and (aggregate["min"] != aggregate["max"] or aggregate["sum"] != aggregate["min"]):
            raise ValueError("inconsistent singleton")
        mode = engine.options["mode"]
        if mode == "tumbling" and [(start, end)] != tumbling(start, engine.options["size"]):
            raise ValueError("invalid tumbling geometry")
        if mode == "sliding" and (start, end) not in sliding(start, engine.options["size"], engine.options["slide"]):
            raise ValueError("invalid sliding geometry")
        if mode == "session" and end < start + engine.options["gap"]:
            raise ValueError("invalid session geometry")
    for key, intervals in payload["sessions"].items():
        if not isinstance(key, str) or not isinstance(intervals, list):
            raise ValueError("invalid session")
        previous = -math.inf
        for start, end in intervals:
            if not number(start) or not number(end) or start >= end or start <= previous or end <= engine.watermark:
                raise ValueError("invalid session interval")
            previous = end
            session_rows.add((key, start, end))
    if engine.options["mode"] == "session":
        if seen != session_rows:
            raise ValueError("session aggregate mismatch")
    elif session_rows:
        raise ValueError("unexpected sessions")
    for row in payload["late"]:
        if not number(row["value"]) or row["timestamp"] >= engine.watermark:
            raise ValueError("invalid late record")
        Event(**row)
    if engine.options["late_policy"] != "side" and payload["late"]:
        raise ValueError("unexpected side output")


# @id CODE-SNAPSHOT-001 @implements REQ-SNAPSHOT-001 REQ-SNAPSHOT-005 REQ-SNAPSHOT-006 REQ-SNAPSHOT-007 REQ-SNAPSHOT-008
def dumps(engine):
    payload = {
        "options": engine.options,
        "watermark": None if engine.watermark == -math.inf else engine.watermark,
        "windows": [dict(key=k[0], start=k[1], end=k[2], aggregate=v) for k, v in sorted(engine.windows.items())],
        "sessions": engine.sessions.windows,
        "late": [asdict(e) for e in engine.late],
        "dropped": engine.dropped,
    }
    digest = hashlib.sha256(canonical(payload).encode()).hexdigest()
    return canonical({"version": 1, "digest": digest, "payload": payload})


# @id CODE-SNAPSHOT-002 @implements REQ-SNAPSHOT-001 REQ-SNAPSHOT-002 REQ-SNAPSHOT-003 REQ-SNAPSHOT-004 REQ-SNAPSHOT-007 REQ-SNAPSHOT-008 REQ-SNAPSHOT-009
def loads(encoded):
    try:
        doc = json.loads(encoded)
        if doc["version"] != 1:
            raise ValueError("unknown checkpoint version")
        payload = doc["payload"]
        if hashlib.sha256(canonical(payload).encode()).hexdigest() != doc["digest"]:
            raise ValueError("checkpoint integrity failure")
        engine = Engine(**payload["options"])
        if payload["watermark"] is not None:
            engine.advance(payload["watermark"])
        validate(payload, engine)
        engine.windows = {(v["key"], v["start"], v["end"]): v["aggregate"] for v in payload["windows"]}
        engine.sessions.windows = {k: [tuple(v) for v in values] for k, values in payload["sessions"].items()}
        engine.late = [Event(**e) for e in payload["late"]]
        engine.dropped = payload["dropped"]
        return engine
    except (KeyError, TypeError, AttributeError, OverflowError, json.JSONDecodeError) as exc:
        raise ValueError("invalid checkpoint") from exc
