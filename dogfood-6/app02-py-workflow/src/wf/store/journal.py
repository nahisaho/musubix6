import json
import os

from .errors import CorruptJournal


# @id CODE-STORE-005
# @implements REQ-STORE-005
def append(path, record):
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, sort_keys=False) + "\n")
        f.flush()
        os.fsync(f.fileno())


# @id CODE-STORE-007
# @implements REQ-STORE-007
def read_all(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    records = []
    for i, line in enumerate(lines):
        try:
            records.append(json.loads(line))
        except ValueError:
            if i == len(lines) - 1:
                break
            raise CorruptJournal(f"line {i + 1} is corrupt")
    return records
