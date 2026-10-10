package sx.analysis;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.junit.jupiter.api.Test;
import sx.core.Token;

class AnalysisTest {
    private static List<String> terms(List<Token> ts) {
        return ts.stream().map(Token::term).toList();
    }

    private static List<Integer> pos(List<Token> ts) {
        return ts.stream().map(Token::position).toList();
    }

    /** @id TEST-ANALYSIS-001 @verifies REQ-ANALYSIS-001 */
    @Test
    void test_analysis_001_split_and_positions() {
        List<Token> ts = Tokenizer.tokenize("Hello, world!! foo_bar 42x");
        assertEquals(List.of("Hello", "world", "foo", "bar", "42x"), terms(ts));
        assertEquals(List.of(0, 1, 2, 3, 4), pos(ts));
        assertEquals(List.of("e\u0301t\u0301e"), terms(Tokenizer.tokenize("e\u0301t\u0301e")));
    }

    /** @id TEST-ANALYSIS-002 @verifies REQ-ANALYSIS-002 */
    @Test
    void test_analysis_002_null_and_blank() {
        assertThrows(IllegalArgumentException.class, () -> Tokenizer.tokenize(null));
        assertTrue(Tokenizer.tokenize("").isEmpty());
        assertTrue(Tokenizer.tokenize("  \t\n -- ").isEmpty());
    }

    /** @id TEST-ANALYSIS-003 @verifies REQ-ANALYSIS-003 */
    @Test
    void test_analysis_003_long_token_dropped() {
        String ok = "a".repeat(255);
        String tooLong = "b".repeat(256);
        List<Token> ts = Tokenizer.tokenize(ok + " " + tooLong + " tail");
        assertEquals(List.of(ok, "tail"), terms(ts));
        assertEquals(List.of(0, 2), pos(ts));
    }

    /** @id TEST-ANALYSIS-004 @verifies REQ-ANALYSIS-004 */
    @Test
    void test_analysis_004_lowercase_root_locale() {
        Locale old = Locale.getDefault();
        try {
            Locale.setDefault(Locale.forLanguageTag("tr-TR"));
            assertEquals("title", Filters.lowercase("TITLE"));
            assertEquals("i\u0307", Filters.lowercase("\u0130"));
        } finally {
            Locale.setDefault(old);
        }
    }

    /** @id TEST-ANALYSIS-005 @verifies REQ-ANALYSIS-005 */
    @Test
    void test_analysis_005_fold_accents_and_width() {
        assertEquals("cafe", Filters.fold("caf\u00e9"));
        assertEquals("cafe", Filters.fold("cafe\u0301"));
        assertEquals("full", Filters.fold("\uff46\uff55\uff4c\uff4c"));
        assertEquals("ﬁne".length() + 1, Filters.fold("ﬁne").length());
    }

    /** @id TEST-ANALYSIS-006 @verifies REQ-ANALYSIS-006 */
    @Test
    void test_analysis_006_stop_keeps_gaps() {
        List<Token> ts = Filters.removeStopwords(
                Tokenizer.tokenize("over the lazy dog"), Set.of("the"));
        assertEquals(List.of("over", "lazy", "dog"), terms(ts));
        assertEquals(List.of(0, 2, 3), pos(ts));
    }

    /** @id TEST-ANALYSIS-007 @verifies REQ-ANALYSIS-007 */
    @Test
    void test_analysis_007_porter_1a() {
        assertEquals("caress", Stemmer.stem("caresses"));
        assertEquals("poni", Stemmer.stem("ponies"));
        assertEquals("caress", Stemmer.stem("caress"));
        assertEquals("cat", Stemmer.stem("cats"));
        assertEquals("ti", Stemmer.stem("ties"));
    }

    /** @id TEST-ANALYSIS-008 @verifies REQ-ANALYSIS-008 */
    @Test
    void test_analysis_008_porter_1b() {
        assertEquals("agree", Stemmer.stem("agreed"));
        assertEquals("feed", Stemmer.stem("feed"));
        assertEquals("plaster", Stemmer.stem("plastered"));
        assertEquals("bled", Stemmer.stem("bled"));
        assertEquals("motor", Stemmer.stem("motoring"));
        assertEquals("sing", Stemmer.stem("sing"));
        assertEquals("file", Stemmer.stem("filing"));
        assertEquals("fail", Stemmer.stem("failing"));
        assertEquals("conflate", Stemmer.stem("conflated"));
        assertEquals("trouble", Stemmer.stem("troubled"));
        assertEquals("size", Stemmer.stem("sized"));
        assertEquals("hop", Stemmer.stem("hopping"));
        assertEquals("fall", Stemmer.stem("falling"));
        assertEquals("hiss", Stemmer.stem("hissing"));
        assertEquals("fizz", Stemmer.stem("fizzed"));
    }

    /** @id TEST-ANALYSIS-009 @verifies REQ-ANALYSIS-009 */
    @Test
    void test_analysis_009_standard_pipeline() {
        List<Token> ts = Analyzer.standard().analyze("The Caf\u00e9s were Running over the LAZY ponies");
        assertEquals(List.of("cafe", "were", "run", "over", "lazy", "poni"), terms(ts));
        assertEquals(List.of(1, 2, 3, 4, 6, 7), pos(ts));
    }

    /** @id TEST-ANALYSIS-010 @verifies REQ-ANALYSIS-010 */
    @Test
    void test_analysis_010_stem_never_empty() {
        assertEquals("s", Stemmer.stem("s"));
        assertEquals("is", Stemmer.stem("is"));
        List<Token> ts = Analyzer.standard().analyze("it's");
        assertEquals(List.of("s"), terms(ts));
    }
}
