package bpmn.model;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class ModelValidator {
    private ModelValidator() {}

    /** @id CODE-MODEL-005 @implements REQ-MODEL-006 REQ-MODEL-007 REQ-MODEL-008 REQ-MODEL-009 REQ-MODEL-010 REQ-MODEL-011 REQ-MODEL-012 */
    public static List<Issue> validate(ProcessModel m) {
        List<Issue> is = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Set<String> dups = new HashSet<>();
        for (Node n : m.nodes()) if (!seen.add(n.id()) && dups.add(n.id())) is.add(new Issue("DUPLICATE_ID", n.id(), "duplicate node id"));
        Set<String> unknown = new HashSet<>();
        for (Flow f : m.flows()) {
            for (String e : new String[] {f.from(), f.to()}) if (m.node(e) == null && unknown.add(e)) is.add(new Issue("UNKNOWN_NODE", e, "flow references unknown node"));
        }
        List<Node> starts = m.nodes().stream().filter(n -> n.type() == NodeType.START).toList();
        if (starts.size() != 1) is.add(new Issue("START_COUNT", String.valueOf(starts.size()), "expected exactly one start"));
        List<Node> ends = m.nodes().stream().filter(n -> n.type() == NodeType.END).toList();
        if (ends.isEmpty()) is.add(new Issue("NO_END", "-", "no end node"));
        if (starts.size() == 1) {
            Set<String> fwd = reach(m, starts.get(0).id(), true);
            Set<String> endIds = new HashSet<>();
            for (Node e : ends) endIds.add(e.id());
            Set<String> back = new HashSet<>();
            for (String e : endIds) back.addAll(reach(m, e, false));
            for (Node n : m.nodes()) {
                if (!fwd.contains(n.id())) is.add(new Issue("UNREACHABLE", n.id(), "not reachable from start"));
                else if (!ends.isEmpty() && !back.contains(n.id())) is.add(new Issue("DEAD_END", n.id(), "cannot reach an end"));
            }
        }
        for (Node n : m.nodes()) {
            if (n.type() == NodeType.XOR) xor(m, n, is);
            if (n.type() == NodeType.AND && m.incoming(n.id()).size() > 1 && m.outgoing(n.id()).size() > 1)
                is.add(new Issue("AND_MIXED", n.id(), "parallel gateway must be split or join"));
        }
        is.sort(Comparator.comparing(Issue::code).thenComparing(Issue::subject));
        return List.copyOf(is);
    }

    private static void xor(ProcessModel m, Node n, List<Issue> is) {
        List<Flow> out = m.outgoing(n.id());
        if (out.size() < 2) return;
        long defaults = out.stream().filter(Flow::isDefault).count();
        boolean bad = defaults > 1 || out.stream().anyMatch(f -> !f.isDefault() && f.condition() == null);
        if (bad) is.add(new Issue("XOR_FLOWS", n.id(), "exclusive split needs conditions and at most one default"));
    }

    private static Set<String> reach(ProcessModel m, String from, boolean forward) {
        Set<String> seen = new HashSet<>();
        ArrayDeque<String> q = new ArrayDeque<>();
        q.add(from);
        while (!q.isEmpty()) {
            String c = q.poll();
            if (!seen.add(c)) continue;
            for (Flow f : forward ? m.outgoing(c) : m.incoming(c)) q.add(forward ? f.to() : f.from());
        }
        return seen;
    }
}
