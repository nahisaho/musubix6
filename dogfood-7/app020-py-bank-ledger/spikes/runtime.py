from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal, ROUND_HALF_EVEN
from threading import RLock

assert Decimal("-1.005").quantize(Decimal(".01"), rounding=ROUND_HALF_EVEN) == Decimal("-1.00")
assert Decimal("1.2345").quantize(Decimal(".001"), rounding=ROUND_HALF_EVEN) == Decimal("1.234")
assert not Decimal("NaN").is_finite()
lock = RLock()
values = []
def append(i):
    with lock:
        values.append(i)
with ThreadPoolExecutor(max_workers=8) as pool:
    list(pool.map(append, range(100)))
assert len(values) == 100
print("Decimal precision and lock serialization: PASS")
