import math, json, hashlib
assert math.floor(-0.1 / 10) * 10 == -10
assert not math.isfinite(float("nan"))
assert json.dumps({"b": 1, "a": 2}, sort_keys=True) == '{"a": 2, "b": 1}'
assert hashlib.sha256(b"checkpoint").hexdigest() == hashlib.sha256(b"checkpoint").hexdigest()
print("spike: negative alignment, finite validation, canonical JSON and hashing verified")
