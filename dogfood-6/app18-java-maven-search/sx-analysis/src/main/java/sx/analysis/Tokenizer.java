package sx.analysis;

import java.util.ArrayList;
import java.util.List;
import sx.core.Token;

public final class Tokenizer {
    public static final int MAX_TOKEN_LENGTH = 255;

    private Tokenizer() {}

    private static boolean isTokenChar(int cp) {
        return Character.isLetterOrDigit(cp) || Character.getType(cp) == Character.NON_SPACING_MARK;
    }

    /** @id CODE-ANALYSIS-002 @implements REQ-ANALYSIS-001 REQ-ANALYSIS-002 REQ-ANALYSIS-003 */
    public static List<Token> tokenize(String text) {
        if (text == null) {
            throw new IllegalArgumentException("text must not be null");
        }
        List<Token> out = new ArrayList<>();
        int position = 0;
        int i = 0;
        int n = text.length();
        while (i < n) {
            int cp = text.codePointAt(i);
            if (!isTokenChar(cp)) {
                i += Character.charCount(cp);
                continue;
            }
            int start = i;
            while (i < n && isTokenChar(text.codePointAt(i))) {
                i += Character.charCount(text.codePointAt(i));
            }
            String word = text.substring(start, i);
            if (word.length() <= MAX_TOKEN_LENGTH) {
                out.add(new Token(word, position));
            }
            position++;
        }
        return out;
    }
}
