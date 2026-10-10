# Deterministic Python actor runtime

Run `python3 -m pytest` from this directory (Python 3, pytest).
No threads, sockets, sleeps, or external services are used.

```python
from actor_runtime.scheduler import Runtime
from actor_runtime.supervision import Supervisor

runtime = Runtime()
supervisor = Supervisor(runtime, "one-for-one")
seen = []
supervisor.add_actor("worker", lambda: lambda rt, name, message: seen.append(message))
runtime.send("worker", {"job": 1})
assert runtime.run(10) == 1
assert seen == [{"job": 1}]
```

## Components
- `mailbox`: bounded FIFO snapshots; close rejects sends but permits draining.
- `scheduler`: spawn-order round robin; one message per atomic turn; self-sends
  are future work. Trace records message snapshots even when handlers fail.
- `supervision`: one-for-one, one-for-all, rest-for-one; tick-window restart
  budgets; nested trees escalate by suspending before recreation. Successful
  restart keeps queued work and clears transient scheduling blocks. Terminal
  root exhaustion discards queues. Handler factories must be callable and
  reliable; factory exceptions are intentionally propagated.
- `deadlock`: iterative SCC analysis, sorted output; `release(name)` removes
  both outgoing and incoming edges for that actor. Runtime `block`/`unblock`
  controls readiness separately. Cyclic waits can still be resolved externally.
- `remoting`: virtual-clock heap, stable FIFO ties, undirected partitions
  evaluated at delivery, at-most-once delivery and inspectable dead letters.
  Call `advance(0)` to deliver zero-latency events.

Payloads are acyclic JSON-like builtins; dictionary keys are strings.
Top-level `None` is reserved for empty mailboxes; nested nulls are allowed.
Unsupported objects raise `TypeError`; containers are cloned before delivery.
This is a simulation, not a thread-safe or persistent actor system.

## SDD evidence
Five T2 specs cover 46 requirements. Tests include five regression cycles
(blocked actor restart, deep graphs, dynamic spawn order, stopped-sibling
recreation, deep snapshots) and a scheduler refactor.
Spec approvals cite independent AI reviews.
Always run the full gate: changed-file discovery in this nested worktree is
affected by the already-reported root-scoping issue.
