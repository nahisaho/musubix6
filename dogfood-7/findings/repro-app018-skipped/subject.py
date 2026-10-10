import os

# @id CODE-SKIP-001
# @implements REQ-SKIP-001
def value():
    return 0


def disabled():
    return os.environ.get("SKIP_REPRO") == "1"
