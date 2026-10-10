from wf.retry.runner import RetriesExhausted, run_with_retry
from wf.store.states import State

from .report import RunReport


class Engine:
    def __init__(self, graph, actions, store, clock, policy):
        self._graph = graph
        self._actions = actions
        self._store = store
        self._clock = clock
        self._policy = policy
        self._cancelled = False

    def cancel(self):
        self._cancelled = True

    # @id CODE-ENGINE-001
    # @implements REQ-ENGINE-001 REQ-ENGINE-003 REQ-ENGINE-011
    def run(self):
        self._graph.validate()
        order = self._graph.topological_order()
        # @id CODE-ENGINE-012
        # @implements REQ-ENGINE-012
        self._store.recover()
        results = {}
        for task in order:
            self._step(task, results)
        return RunReport(
            states={t: self._store.state(t) for t in order},
            results=results,
        )

    def _step(self, task, results):
        st = self._store.state(task)
        # @id CODE-ENGINE-008
        # @implements REQ-ENGINE-008
        if st == State.SUCCEEDED:
            results[task] = self._store.history(task)[-1]["detail"]["result"]
            return
        if st.name in ("FAILED", "CANCELLED"):
            return
        deps = self._graph.deps(task)
        # @id CODE-ENGINE-005
        # @implements REQ-ENGINE-005 REQ-ENGINE-006 REQ-ENGINE-007
        if self._cancelled or any(self._store.state(d) != State.SUCCEEDED for d in deps):
            self._store.transition(task, State.CANCELLED)
            return
        # @id CODE-ENGINE-002
        # @implements REQ-ENGINE-002
        ok, value = self._execute(task, {d: results[d] for d in deps})
        if ok:
            results[task] = value

    def _execute(self, task, dep_results):
        # @id CODE-ENGINE-004
        # @implements REQ-ENGINE-004 REQ-ENGINE-010
        store = self._store

        def attempt():
            if store.state(task) == State.RETRYING:
                store.transition(task, State.RUNNING)
            return self._actions[task](dep_results)

        def on_retry(n, err, delay):
            store.transition(task, State.RETRYING, detail={"attempt": n, "error": str(err), "delay": delay})

        if store.state(task) != State.RETRYING:
            store.transition(task, State.RUNNING)
        try:
            value = run_with_retry(attempt, self._policy, self._clock, on_retry=on_retry)
        except RetriesExhausted as err:
            store.transition(task, State.FAILED, detail={"error": str(err.last_error)})
            return False, None
        store.transition(task, State.SUCCEEDED, detail={"result": value})
        return True, value
