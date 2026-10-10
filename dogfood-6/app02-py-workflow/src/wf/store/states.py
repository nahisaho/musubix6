from enum import Enum


class State(Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    RETRYING = "RETRYING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


# @id CODE-STORE-001
# @implements REQ-STORE-001
TRANSITIONS = {
    State.PENDING: {State.RUNNING, State.CANCELLED},
    State.RUNNING: {State.SUCCEEDED, State.FAILED, State.RETRYING, State.CANCELLED},
    State.RETRYING: {State.RUNNING, State.CANCELLED},
    State.SUCCEEDED: set(),
    State.FAILED: set(),
    State.CANCELLED: set(),
}


# @id CODE-STORE-004
# @implements REQ-STORE-004
def is_terminal(state):
    return not TRANSITIONS[state]
