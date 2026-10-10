# Event-time dataflow engine

Python 3.10+ and pytest; no runtime dependencies. Run `python3 -m pytest -q`.

```python
from dataflow.clock import Event
from dataflow.engine import Engine
from dataflow.checkpoint import dumps, loads

stream = Engine(mode="sliding", size=10, slide=5, late_policy="side")
stream.process(Event(9, "sensor-a", 2))
stream = loads(dumps(stream))
print(stream.advance(15))
```

Modules:
- `clock`: immutable events, bounded partition watermarks, idle/reactivation.
- `windows`: half-open tumbling/sliding assignment and keyed session merging.
- `state`: keyed count/sum/min/max, filter and immutable mapping operators.
- `engine`: explicit monotonic finite watermarks, atomic aggregate updates,
  deterministic window emission, drop/side/error lateness policies.
- `checkpoint`: deterministic versioned JSON, SHA256 integrity and state validation.

Timestamps and values must be finite. Fractional fixed-window alignment uses
decimal-string representations of floats; unrepresentable window boundaries
and arithmetic overflow are rejected. Session arrivals exactly one gap apart
merge. Watermark equality is on-time, and windows close when end ≤ watermark.
`Clock` calculates partition watermarks separately; the engine does not advance
automatically. Events/keys are trusted local input (string keys). Processing is
synchronous, not thread-safe, and no durable filesystem/transaction manager is
provided. Checkpoint digests detect corruption, not malicious modification.

SDD: five T2 features, 46 requirements, five regression-fix cycles,
one refactor cycle. Specs/locks/evidence/review are in `.sdd/`.
Spike: `python3 tools/spike.py`.
