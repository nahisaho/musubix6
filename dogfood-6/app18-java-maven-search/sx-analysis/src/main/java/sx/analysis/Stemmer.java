package sx.analysis;

public final class Stemmer {
    private Stemmer() {}

    private static boolean isConsonant(String w, int i) {
        char c = w.charAt(i);
        return switch (c) {
            case 'a', 'e', 'i', 'o', 'u' -> false;
            case 'y' -> i == 0 || !isConsonant(w, i - 1);
            default -> true;
        };
    }

    /** Porter measure m of the first {@code len} chars: number of VC sequences. */
    private static int measure(String w, int len) {
        int m = 0;
        int i = 0;
        while (i < len && isConsonant(w, i)) i++;
        while (i < len) {
            while (i < len && !isConsonant(w, i)) i++;
            if (i >= len) break;
            m++;
            while (i < len && isConsonant(w, i)) i++;
        }
        return m;
    }

    private static boolean hasVowel(String w, int len) {
        for (int i = 0; i < len; i++) if (!isConsonant(w, i)) return true;
        return false;
    }

    private static boolean doubleConsonant(String w) {
        int n = w.length();
        return n >= 2 && w.charAt(n - 1) == w.charAt(n - 2) && isConsonant(w, n - 1);
    }

    /** consonant-vowel-consonant ending where the last consonant is not w, x or y. */
    private static boolean cvc(String w) {
        int n = w.length();
        if (n < 3 || !isConsonant(w, n - 1) || isConsonant(w, n - 2) || !isConsonant(w, n - 3)) return false;
        char c = w.charAt(n - 1);
        return c != 'w' && c != 'x' && c != 'y';
    }

    /** @id CODE-ANALYSIS-006 @implements REQ-ANALYSIS-007 */
    static String step1a(String w) {
        if (w.endsWith("sses")) return w.substring(0, w.length() - 2);
        if (w.endsWith("ies")) return w.substring(0, w.length() - 2);
        if (w.endsWith("ss")) return w;
        if (w.endsWith("s")) return w.substring(0, w.length() - 1);
        return w;
    }

    /** @id CODE-ANALYSIS-007 @implements REQ-ANALYSIS-008 */
    static String step1b(String w) {
        if (w.endsWith("eed")) {
            return measure(w, w.length() - 3) > 0 ? w.substring(0, w.length() - 1) : w;
        }
        String stem;
        if (w.endsWith("ed") && hasVowel(w, w.length() - 2)) {
            stem = w.substring(0, w.length() - 2);
        } else if (w.endsWith("ing") && hasVowel(w, w.length() - 3)) {
            stem = w.substring(0, w.length() - 3);
        } else {
            return w;
        }
        if (stem.endsWith("at") || stem.endsWith("bl") || stem.endsWith("iz")) return stem + "e";
        if (doubleConsonant(stem)) {
            char c = stem.charAt(stem.length() - 1);
            if (c != 'l' && c != 's' && c != 'z') return stem.substring(0, stem.length() - 1);
            return stem;
        }
        if (measure(stem, stem.length()) == 1 && cvc(stem)) return stem + "e";
        return stem;
    }

    /** @id CODE-ANALYSIS-009 @implements REQ-ANALYSIS-010 */
    public static String stem(String w) {
        if (w.length() <= 2) return w;
        return step1b(step1a(w));
    }
}
