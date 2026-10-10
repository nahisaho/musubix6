# @id CODE-DEADLOCK-001 @implements REQ-DEADLOCK-001 REQ-DEADLOCK-002 REQ-DEADLOCK-003 REQ-DEADLOCK-004 REQ-DEADLOCK-005 REQ-DEADLOCK-006 REQ-DEADLOCK-007 REQ-DEADLOCK-008 REQ-DEADLOCK-009
class WaitGraph:
    def __init__(self):
        self.edges = {}

    def wait(self, actor, target):
        self.edges.setdefault(actor, set()).add(target)
        self.edges.setdefault(target, set())

    def release(self, actor):
        self.edges.pop(actor, None)
        for targets in self.edges.values():
            targets.discard(actor)

    def cycles(self):
        seen, order = set(), []
        reverse = {node: set() for node in self.edges}
        for node, targets in self.edges.items():
            for target in targets:
                reverse[target].add(node)
        for root in sorted(self.edges):
            if root in seen:
                continue
            seen.add(root)
            stack = [(root, iter(sorted(self.edges[root])))]
            while stack:
                node, neighbors = stack[-1]
                target = next(neighbors, None)
                if target is None:
                    order.append(node)
                    stack.pop()
                elif target not in seen:
                    seen.add(target)
                    stack.append((target, iter(sorted(self.edges[target]))))
        seen.clear()
        result = []
        for root in reversed(order):
            if root in seen:
                continue
            component, pending = [], [root]
            seen.add(root)
            while pending:
                node = pending.pop()
                component.append(node)
                for target in reverse[node]:
                    if target not in seen:
                        seen.add(target)
                        pending.append(target)
            if len(component) > 1 or root in self.edges[root]:
                result.append(tuple(sorted(component)))
        return sorted(result)
