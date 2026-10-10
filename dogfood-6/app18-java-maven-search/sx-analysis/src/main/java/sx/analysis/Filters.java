package sx.analysis;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import sx.core.Token;

public final class Filters {
    private Filters() {}

    /** @id CODE-ANALYSIS-003 @implements REQ-ANALYSIS-004 */
    public static String lowercase(String s) {
        return s.toLowerCase(Locale.ROOT);
    }

    /** @id CODE-ANALYSIS-004 @implements REQ-ANALYSIS-005 */
    public static String fold(String s) {
        String d = Normalizer.normalize(s, Normalizer.Form.NFKD);
        StringBuilder sb = new StringBuilder(d.length());
        d.codePoints().filter(cp -> Character.getType(cp) != Character.NON_SPACING_MARK).forEach(sb::appendCodePoint);
        return sb.toString();
    }

    /** @id CODE-ANALYSIS-005 @implements REQ-ANALYSIS-006 */
    public static List<Token> removeStopwords(List<Token> in, Set<String> stop) {
        List<Token> out = new ArrayList<>();
        for (Token t : in) {
            if (!stop.contains(t.term())) {
                out.add(t);
            }
        }
        return out;
    }
}
