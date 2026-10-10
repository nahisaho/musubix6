package bpmn.engine;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public final class Expr {
    private interface Ast { Object eval(Map<String, Object> vars); }

    private record Tok(String kind, String text, int pos) {}

    private final Ast root;

    private Expr(Ast root) { this.root = root; }

    /** @id CODE-GATEWAYS-001 @implements REQ-GATEWAYS-001 REQ-GATEWAYS-002 REQ-GATEWAYS-004 REQ-GATEWAYS-015 */
    public static Expr parse(String text) {
        Parser p = new Parser(lex(text));
        Ast a = p.or();
        if (!p.peek().kind().equals("eof")) throw new ExprException("SYNTAX", p.peek().pos(), "unexpected '" + p.peek().text() + "'");
        return new Expr(a);
    }

    /** @id CODE-GATEWAYS-002 @implements REQ-GATEWAYS-004 */
    public Object eval(Map<String, Object> vars) {
        Object r = root.eval(vars);
        if (!(r instanceof Boolean)) throw new ExprException("TYPE", 0, "condition must be boolean");
        return r;
    }

    private static List<Tok> lex(String s) {
        List<Tok> out = new ArrayList<>();
        int i = 0;
        while (i < s.length()) {
            char c = s.charAt(i);
            if (Character.isWhitespace(c)) { i++; continue; }
            int st = i;
            if (Character.isDigit(c) || (c == '-' && i + 1 < s.length() && Character.isDigit(s.charAt(i + 1)))) {
                i++;
                while (i < s.length() && Character.isDigit(s.charAt(i))) i++;
                if (i < s.length() && s.charAt(i) == '.') {
                    i++;
                    int fs = i;
                    while (i < s.length() && Character.isDigit(s.charAt(i))) i++;
                    if (i == fs || (i < s.length() && s.charAt(i) == '.')) throw new ExprException("SYNTAX", st, "malformed number");
                }
                out.add(new Tok("num", s.substring(st, i), st));
            } else if (Character.isLetter(c) || c == '_') {
                while (i < s.length() && (Character.isLetterOrDigit(s.charAt(i)) || s.charAt(i) == '_' || s.charAt(i) == '.')) i++;
                out.add(new Tok("id", s.substring(st, i), st));
            } else if (c == '"') {
                i++;
                while (i < s.length() && s.charAt(i) != '"') i++;
                if (i >= s.length()) throw new ExprException("SYNTAX", st, "unterminated string");
                out.add(new Tok("str", s.substring(st + 1, i), st));
                i++;
            } else {
                String two = i + 1 < s.length() ? s.substring(i, i + 2) : "";
                if (List.of("==", "!=", "<=", ">=", "&&", "||").contains(two)) { out.add(new Tok("op", two, st)); i += 2; }
                else if ("<>!()".indexOf(c) >= 0) { out.add(new Tok("op", String.valueOf(c), st)); i++; }
                else throw new ExprException("SYNTAX", st, "unexpected character '" + c + "'");
            }
        }
        out.add(new Tok("eof", "<end>", s.length()));
        return out;
    }

    private static final class Parser {
        private final List<Tok> toks;
        private int i;

        Parser(List<Tok> toks) { this.toks = toks; }

        Tok peek() { return toks.get(i); }

        boolean isOp(String... ops) {
            Tok t = peek();
            if (!t.kind().equals("op")) return false;
            for (String o : ops) if (t.text().equals(o)) return true;
            return false;
        }

        /** @id CODE-GATEWAYS-003 @implements REQ-GATEWAYS-003 */
        Ast or() {
            Ast l = and();
            while (isOp("||")) {
                i++;
                Ast a = l, b = and();
                l = v -> Boolean.TRUE.equals(bool(a.eval(v))) ? Boolean.TRUE : bool(b.eval(v));
            }
            return l;
        }

        Ast and() {
            Ast l = not();
            while (isOp("&&")) {
                i++;
                Ast a = l, b = not();
                l = v -> Boolean.FALSE.equals(bool(a.eval(v))) ? Boolean.FALSE : bool(b.eval(v));
            }
            return l;
        }

        Ast not() {
            if (isOp("!")) {
                i++;
                Ast a = not();
                return v -> !bool(a.eval(v));
            }
            return cmp();
        }

        Ast cmp() {
            Ast l = term();
            if (isOp("==", "!=", "<", "<=", ">", ">=")) {
                Tok op = toks.get(i++);
                Ast r = term();
                return v -> compare(op, l.eval(v), r.eval(v));
            }
            return l;
        }

        Ast term() {
            Tok t = toks.get(i);
            switch (t.kind()) {
                case "num": { i++; Double d = Double.valueOf(t.text()); return v -> d; }
                case "str": { i++; return v -> t.text(); }
                case "id": {
                    i++;
                    if (t.text().equals("true")) return v -> Boolean.TRUE;
                    if (t.text().equals("false")) return v -> Boolean.FALSE;
                    return v -> {
                        if (!v.containsKey(t.text())) throw new ExprException("UNDEFINED", t.pos(), "undefined variable " + t.text());
                        return norm(v.get(t.text()), t);
                    };
                }
                default:
                    if (isOp("(")) {
                        i++;
                        Ast a = or();
                        if (!isOp(")")) throw new ExprException("SYNTAX", peek().pos(), "expected ')'");
                        i++;
                        return a;
                    }
                    throw new ExprException("SYNTAX", t.pos(), "unexpected '" + t.text() + "'");
            }
        }
    }

    /** @id CODE-GATEWAYS-004 @implements REQ-GATEWAYS-005 */
    private static Object norm(Object o, Tok t) {
        if (o instanceof Number n) return n.doubleValue();
        if (o instanceof String || o instanceof Boolean) return o;
        throw new ExprException("TYPE", t.pos(), "unsupported value type for " + t.text());
    }

    private static boolean bool(Object o) {
        if (o instanceof Boolean b) return b;
        throw new ExprException("TYPE", 0, "expected boolean");
    }

    private static Object compare(Tok op, Object a, Object b) {
        String o = op.text();
        if (a instanceof Double x && b instanceof Double y) return cmpResult(o, Double.compare(x, y), op);
        if (a instanceof String x && b instanceof String y) return cmpResult(o, x.compareTo(y), op);
        if (a instanceof Boolean x && b instanceof Boolean y && (o.equals("==") || o.equals("!="))) return o.equals("==") == x.equals(y);
        throw new ExprException("TYPE", op.pos(), "cannot apply " + o + " to these operand types");
    }

    private static Object cmpResult(String o, int c, Tok op) {
        return switch (o) {
            case "==" -> c == 0;
            case "!=" -> c != 0;
            case "<" -> c < 0;
            case "<=" -> c <= 0;
            case ">" -> c > 0;
            default -> c >= 0;
        };
    }
}
