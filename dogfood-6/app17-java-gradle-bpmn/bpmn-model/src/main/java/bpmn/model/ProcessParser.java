package bpmn.model;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class ProcessParser {
    private ProcessParser() {}

    /** @id CODE-MODEL-002 @implements REQ-MODEL-001 REQ-MODEL-002 REQ-MODEL-003 */
    public static ProcessModel parse(String text) {
        String pid = null;
        List<Node> nodes = new ArrayList<>();
        List<Flow> flows = new ArrayList<>();
        String[] lines = text.split("\r?\n", -1);
        for (int i = 0; i < lines.length; i++) {
            int ln = i + 1;
            String line = lines[i].strip();
            if (line.isEmpty() || line.startsWith("#")) continue;
            List<String> t = tokenize(line, ln);
            String kw = t.get(0);
            if (kw.equals("process")) {
                if (t.size() != 2) throw new ParseException(ln, "expected: process <id>");
                pid = t.get(1);
            } else if (kw.equals("flow")) {
                flows.add(parseFlow(line, ln));
            } else {
                NodeType type = nodeType(kw, ln);
                if (pid == null) throw new ParseException(ln, "process declaration must come first");
                if (t.size() < 2) throw new ParseException(ln, "missing node id");
                nodes.add(new Node(t.get(1), type, attrs(t.subList(2, t.size()), ln)));
            }
        }
        if (pid == null) throw new ParseException(1, "missing process declaration");
        return new ProcessModel(pid, nodes, flows);
    }

    private static NodeType nodeType(String kw, int ln) {
        try {
            return NodeType.valueOf(kw.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new ParseException(ln, "unknown statement '" + kw + "'");
        }
    }

    /** @id CODE-MODEL-003 @implements REQ-MODEL-004 */
    static Map<String, String> attrs(List<String> toks, int ln) {
        Map<String, String> m = new LinkedHashMap<>();
        for (String tok : toks) {
            int eq = tok.indexOf('=');
            if (eq <= 0) throw new ParseException(ln, "expected key=value but got '" + tok + "'");
            m.put(tok.substring(0, eq), tok.substring(eq + 1));
        }
        return m;
    }

    /** Splits on whitespace; a double-quoted section is kept together with its quotes removed. */
    static List<String> tokenize(String line, int ln) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean inQ = false, has = false;
        for (char c : line.toCharArray()) {
            if (c == '"') { inQ = !inQ; has = true; }
            else if (Character.isWhitespace(c) && !inQ) {
                if (has) { out.add(cur.toString()); cur.setLength(0); has = false; }
            } else { cur.append(c); has = true; }
        }
        if (inQ) throw new ParseException(ln, "unterminated quote");
        if (has) out.add(cur.toString());
        return out;
    }

    /** @id CODE-MODEL-004 @implements REQ-MODEL-005 */
    static Flow parseFlow(String line, int ln) {
        String rest = line.substring("flow".length()).strip();
        int arrow = rest.indexOf("->");
        if (arrow < 0) throw new ParseException(ln, "expected: flow <a> -> <b>");
        String from = rest.substring(0, arrow).strip();
        String right = rest.substring(arrow + 2).strip();
        if (from.isEmpty() || from.contains(" ") || right.isEmpty()) throw new ParseException(ln, "expected: flow <a> -> <b>");
        String to = right, cond = null;
        boolean def = false;
        int sp = right.indexOf(' ');
        if (sp > 0) {
            to = right.substring(0, sp);
            String tail = right.substring(sp).strip();
            if (tail.equals("default")) def = true;
            else if (tail.startsWith("when ") && tail.length() > 5) cond = tail.substring(5).strip();
            else throw new ParseException(ln, "unexpected '" + tail + "' after flow target");
        }
        return new Flow(from, to, cond, def);
    }
}
