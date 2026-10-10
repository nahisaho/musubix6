package sx.query;

import java.util.ArrayList;
import java.util.List;

public final class QueryLexer {
    private QueryLexer() {}

    private static boolean isWordChar(char c) {
        return !Character.isWhitespace(c) && c != '(' && c != ')' && c != '"';
    }

    /** @id CODE-QUERY-001 @implements REQ-QUERY-001 REQ-QUERY-007 */
    public static List<Lexeme> lex(String input) {
        List<Lexeme> out = new ArrayList<>();
        int i = 0;
        int n = input.length();
        while (i < n) {
            char c = input.charAt(i);
            if (Character.isWhitespace(c)) {
                i++;
            } else if (c == '(') {
                out.add(new Lexeme(LexKind.LPAREN, "(", i++));
            } else if (c == ')') {
                out.add(new Lexeme(LexKind.RPAREN, ")", i++));
            } else if (c == '"') {
                int close = input.indexOf('"', i + 1);
                if (close < 0) {
                    throw new QuerySyntaxException("unterminated quote", i);
                }
                out.add(new Lexeme(LexKind.PHRASE, input.substring(i + 1, close), i));
                i = close + 1;
            } else {
                int start = i;
                while (i < n && isWordChar(input.charAt(i))) i++;
                String w = input.substring(start, i);
                LexKind k = switch (w) {
                    case "AND" -> LexKind.AND;
                    case "OR" -> LexKind.OR;
                    case "NOT" -> LexKind.NOT;
                    default -> LexKind.WORD;
                };
                out.add(new Lexeme(k, w, start));
            }
        }
        return out;
    }
}
