from dataclasses import dataclass, field, replace
from threading import RLock
from scheduler.clock import now, duration


@dataclass(frozen=True)
class Lease:
    key: str
    owner: str
    token: int
    expires: object


@dataclass
class LeaseStore:
    clock: object
    entries: dict = field(default_factory=dict)
    token: int = 0
    lock: object = field(default_factory=RLock)


# @id CODE-LEASES-001 @implements REQ-LEASES-001 REQ-LEASES-008
def create_store(clock):
    return LeaseStore(clock)


# @id CODE-LEASES-002 @implements REQ-LEASES-001 REQ-LEASES-002 REQ-LEASES-003 REQ-LEASES-007 REQ-LEASES-008
def acquire(store, key, owner, ttl):
    extension = duration(ttl, positive=True)
    if not isinstance(key, str) or not key or not isinstance(owner, str) or not owner:
        raise ValueError("key and owner must be nonempty strings")
    with store.lock:
        instant = now(store.clock)
        previous = store.entries.get(key)
        if previous and instant < previous.expires:
            return None
        store.token += 1
        lease = Lease(key, owner, store.token, instant + extension)
        store.entries[key] = lease
        return lease


# @id CODE-LEASES-003 @implements REQ-LEASES-003 REQ-LEASES-005
def valid(store, lease):
    with store.lock:
        current = store.entries.get(lease.key)
        return bool(current and current.owner == lease.owner and current.token == lease.token
                    and now(store.clock) < current.expires)


# @id CODE-LEASES-004 @implements REQ-LEASES-004 REQ-LEASES-005 REQ-LEASES-007
def renew(store, lease, ttl):
    extension = duration(ttl, positive=True)
    with store.lock:
        if not valid(store, lease):
            return None
        updated = replace(store.entries[lease.key], expires=now(store.clock) + extension)
        store.entries[lease.key] = updated
        return updated


# @id CODE-LEASES-005 @implements REQ-LEASES-006
def release(store, lease):
    with store.lock:
        if not valid(store, lease):
            return False
        del store.entries[lease.key]
        return True
