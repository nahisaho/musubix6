package sx.query;

import java.util.ArrayList;
import java.util.List;
import sx.analysis.Analyzer;
import sx.core.Token;

public final class QueryParser {
    private final Analyzer analyzer;

    public QueryParser(Analyzer analyzer) {
        this.analyzer = analyzer;
    }

    /** @id CODE-QUERY-002 @implements REQ-QUERY-002 REQ-QUERY-003 REQ-QUERY-004 REQ-QUERY-006 REQ-QUERY-008 REQ-QUERY-011 */
    public Query parse(String input) {
        List<Lexeme> ls = QueryLexer.lex(input);
        if (ls.isEmpty()) {
            throw new QuerySyntaxException("empty query", 0);
        }
        State st = new State(ls, input.length());
        Query q = st.parseOr();
        if (st.peek() != null) {
            throw new QuerySyntaxException("unexpected " + st.peek().kind(), st.peek().offset());
        }
        if (q == null) {
            throw new QuerySyntaxException("query has no searchable terms", 0);
        }
        return q;
    }

    /** @id CODE-QUERY-003 @implements REQ-QUERY-005 REQ-QUERY-010 */
    private Query leaf(String text) {
        List<Token> ts = analyzer.analyze(text);
        if (ts.isEmpty()) {
            return null;
        }
        if (ts.size() == 1) {
            return new Term(ts.get(0).term());
        }
        int base = ts.get(0).position();
        List<Token> rel = new ArrayList<>();
        for (Token t : ts) rel.add(new Token(t.term(), t.position() - base));
        return new Phrase(rel);
    }

    private static Query join(List<Query> parts, boolean and) {
        List<Query> kept = parts.stream().filter(p -> p != null).toList();
        if (kept.isEmpty()) {
            return null;
        }
        if (kept.size() == 1) {
            return kept.get(0);
        }
        return and ? new And(kept) : new Or(kept);
    }

    private final class State {
        private final List<Lexeme> ls;
        private final int end;
        private int i;

        State(List<Lexeme> ls, int end) {
            this.ls = ls;
            this.end = end;
        }

        Lexeme peek() {
            return i < ls.size() ? ls.get(i) : null;
        }

        private boolean startsOperand() {
            Lexeme l = peek();
            return l != null && (l.kind() == LexKind.WORD || l.kind() == LexKind.PHRASE
                    || l.kind() == LexKind.NOT || l.kind() == LexKind.LPAREN);
        }

        private void requireOperand() {
            if (!startsOperand()) {
                Lexeme l = peek();
                throw new QuerySyntaxException("missing operand", l == null ? end : l.offset());
            }
        }

        Query parseOr() {
            requireOperand();
            List<Query> parts = new ArrayList<>();
            parts.add(parseAnd());
            while (peek() != null && peek().kind() == LexKind.OR) {
                i++;
                requireOperand();
                parts.add(parseAnd());
            }
            return join(parts, false);
        }

        Query parseAnd() {
            List<Query> parts = new ArrayList<>();
            parts.add(parseUnary());
            while (true) {
                Lexeme l = peek();
                if (l != null && l.kind() == LexKind.AND) {
                    i++;
                    requireOperand();
                } else if (!startsOperand()) {
                    break;
                }
                parts.add(parseUnary());
            }
            return join(parts, true);
        }

        Query parseUnary() {
            Lexeme l = peek();
            i++;
            switch (l.kind()) {
                case NOT -> {
                    requireOperand();
                    Query inner = parseUnary();
                    return inner == null ? null : new Not(inner);
                }
                case LPAREN -> {
                    requireOperand();
                    Query inner = parseOr();
                    Lexeme close = peek();
                    if (close == null || close.kind() != LexKind.RPAREN) {
                        throw new QuerySyntaxException("unclosed parenthesis", l.offset());
                    }
                    i++;
                    return inner;
                }
                default -> {
                    return leaf(l.text());
                }
            }
        }
    }
}
