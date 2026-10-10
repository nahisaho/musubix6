import os


# @id CODE-CRASH-001 @implements REQ-CRASH-001
def value():
    if os.environ.get("ORM_CRASH") == "1":
        os.abort()
    return 42
