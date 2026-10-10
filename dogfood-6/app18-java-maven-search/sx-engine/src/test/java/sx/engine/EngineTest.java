package sx.engine;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;
import sx.analysis.Analyzer;
import sx.index.InvertedIndex;
import sx.query.Phrase;
import sx.query.QueryParser;
import sx.query.QuerySyntaxException;
import sx.query.Term;
import sx.query.Not;
import sx.rank.Bm25;
import sx.rank.Bm25Scorer;
import sx.rank.Hit;

class EngineTest {
    private static final QueryParser P = new QueryParser(Analyzer.standard());

    private static InvertedIndex index(String... docs) {
        InvertedIndex idx = new InvertedIndex(Analyzer.standard());
        for (int i = 0; i < docs.length; i++) idx.add(i, docs[i]);
        return idx;
    }

    private static int[] match(InvertedIndex idx, String q) {
        return new Evaluator(idx).eval(sx.query.Simplifier.simplify(P.parse(q)));
    }

    /** @id TEST-ENGINE-001 @verifies REQ-ENGINE-001 */
    @Test
    void test_engine_001_term_eval() {
        InvertedIndex idx = index("quick brown fox", "lazy fox", "brown dog");
        Evaluator ev = new Evaluator(idx);
        assertArrayEquals(new int[] {0, 1}, ev.eval(new Term("fox")));
        assertArrayEquals(new int[0], ev.eval(new Term("zzz")));
        idx.delete(1);
        assertArrayEquals(new int[] {0}, ev.eval(new Term("fox")));
    }

    /** @id TEST-ENGINE-002 @verifies REQ-ENGINE-002 */
    @Test
    void test_engine_002_and_merge() {
        assertArrayEquals(new int[] {3, 5}, SetOps.and(new int[] {1, 3, 5}, new int[] {3, 5, 7}));
        assertArrayEquals(new int[0], SetOps.and(new int[0], new int[] {1}));
        assertArrayEquals(new int[0], SetOps.and(new int[] {1}, new int[0]));
        assertArrayEquals(new int[0], SetOps.and(new int[] {1, 2}, new int[] {3, 4}));
        assertArrayEquals(new int[] {1, 2, 3}, SetOps.and(new int[] {1, 2, 3}, new int[] {1, 2, 3}));
        assertArrayEquals(new int[] {5}, SetOps.and(new int[] {1, 2, 3, 4, 5, 6, 7, 8, 9, 10}, new int[] {5}));
        assertArrayEquals(new int[] {0, Integer.MAX_VALUE - 1},
                SetOps.and(new int[] {0, 7, Integer.MAX_VALUE - 1}, new int[] {0, Integer.MAX_VALUE - 1}));
    }

    /** @id TEST-ENGINE-003 @verifies REQ-ENGINE-003 */
    @Test
    void test_engine_003_or_merge() {
        assertArrayEquals(new int[] {1, 2, 3, 4}, SetOps.or(new int[] {1, 3}, new int[] {2, 3, 4}));
        assertArrayEquals(new int[] {1, 2}, SetOps.or(new int[0], new int[] {1, 2}));
        assertArrayEquals(new int[] {1, 2}, SetOps.or(new int[] {1, 2}, new int[0]));
        assertArrayEquals(new int[] {1, 2}, SetOps.or(new int[] {1, 2}, new int[] {1, 2}));
        assertArrayEquals(new int[] {1, 2, 8, 9}, SetOps.or(new int[] {8, 9}, new int[] {1, 2}));
        assertArrayEquals(new int[0], SetOps.or(new int[0], new int[0]));
    }

    /** @id TEST-ENGINE-004 @verifies REQ-ENGINE-004 */
    @Test
    void test_engine_004_not_universe() {
        InvertedIndex idx = index("quick brown fox", "lazy fox", "brown dog");
        assertArrayEquals(new int[] {0, 2}, SetOps.minus(new int[] {0, 1, 2, 3}, new int[] {1, 3}));
        assertArrayEquals(new int[] {2}, new Evaluator(idx).eval(new Not(new Term("fox"))));
        assertArrayEquals(new int[] {2}, match(idx, "NOT fox"));
        idx.delete(2);
        assertArrayEquals(new int[0], match(idx, "NOT fox"));
        assertArrayEquals(new int[] {0}, match(idx, "brown NOT dog"));
    }

    /** @id TEST-ENGINE-005 @verifies REQ-ENGINE-005 */
    @Test
    void test_engine_005_phrase_adjacency() {
        InvertedIndex idx = index("quick brown fox", "lazy fox", "brown dog", "fox brown", "brown x fox");
        assertArrayEquals(new int[] {0}, match(idx, "\"brown fox\""));
        assertArrayEquals(new int[] {0}, match(idx, "\"quick brown fox\""));
        assertArrayEquals(new int[] {3}, match(idx, "\"fox brown\""));
        assertArrayEquals(new int[0], match(idx, "\"fox quick\""));
    }

    /** @id TEST-ENGINE-006 @verifies REQ-ENGINE-006 */
    @Test
    void test_engine_006_phrase_stopword_gap() {
        InvertedIndex idx = index("over the lazy dog", "over lazy dog", "over a lazy", "over big lazy", "lazy over");
        assertArrayEquals(new int[] {0, 2, 3}, match(idx, "\"over the lazy\""));
        assertArrayEquals(new int[] {0, 1, 2, 3, 4}, match(idx, "over lazy"));
        assertArrayEquals(new int[] {1}, match(idx, "\"over lazy\""));
    }

    /** @id TEST-ENGINE-007 @verifies REQ-ENGINE-007 */
    @Test
    void test_engine_007_phrase_repeated_term() {
        InvertedIndex idx = index("buffalo buffalo buffalo", "buffalo", "buffalo x buffalo", "buffalo buffalo");
        assertArrayEquals(new int[] {0, 3}, match(idx, "\"buffalo buffalo\""));
        assertArrayEquals(new int[] {0}, match(idx, "\"buffalo buffalo buffalo\""));
        Phrase p = (Phrase) P.parse("\"buffalo buffalo\"");
        assertEquals(2, p.tokens().size());
    }

    /** @id TEST-ENGINE-008 @verifies REQ-ENGINE-008 */
    @Test
    void test_engine_008_search_ranking() {
        SearchEngine e = new SearchEngine(Analyzer.standard());
        e.add("apple pie");
        e.add("apple apple tart");
        e.add("banana pie");
        e.add("zebra");
        e.add("zebra");
        Bm25Scorer sc = new Bm25Scorer(e.index(), Bm25.defaults());
        List<Hit> expected = sc.top(List.of("apple"), 10);
        assertEquals(expected, e.search("apple", 10));
        assertEquals(1, e.search("apple", 1).size());
        assertEquals(expected.get(0), e.search("apple", 1).get(0));
        assertEquals(List.of(3, 4), e.search("zebra", 10).stream().map(Hit::doc).toList());
        assertEquals(List.of(0), e.search("apple pie", 10).stream().map(Hit::doc).toList());
        assertEquals(List.of(1), e.search("apple NOT pie", 10).stream().map(Hit::doc).toList());
        assertEquals(expected.stream().filter(h -> h.doc() == 1).toList(), e.search("apple NOT pie", 10));
        List<Hit> notOnly = e.search("NOT apple", 10);
        assertEquals(List.of(2, 3, 4), notOnly.stream().map(Hit::doc).toList());
        assertTrue(notOnly.stream().allMatch(h -> h.score() == 0.0));
    }

    /** @id TEST-ENGINE-009 @verifies REQ-ENGINE-009 */
    @Test
    void test_engine_009_delete_and_freeze() {
        SearchEngine e = new SearchEngine(Analyzer.standard());
        for (int i = 0; i < 300; i++) e.add(i % 3 == 0 ? "red fox runs" : i % 3 == 1 ? "red dog" : "blue fox");
        List<Hit> before = e.search("red OR fox", 1000);
        assertEquals(300, before.size());
        e.freeze();
        assertEquals(before, e.search("red OR fox", 1000));
        e.delete(0);
        e.delete(299);
        List<Hit> after = e.search("red OR fox", 1000);
        assertEquals(298, after.size());
        assertTrue(after.stream().noneMatch(h -> h.doc() == 0 || h.doc() == 299));
        assertTrue(e.search("NOT red", 1000).stream().noneMatch(h -> h.doc() == 299));
    }

    /** @id TEST-ENGINE-010 @verifies REQ-ENGINE-010 */
    @Test
    void test_engine_010_errors() {
        SearchEngine e = new SearchEngine(Analyzer.standard());
        e.add("alpha");
        assertThrows(QuerySyntaxException.class, () -> e.search("(alpha", 5));
        assertThrows(IllegalArgumentException.class, () -> e.search("alpha", 0));
        assertThrows(IllegalArgumentException.class, () -> e.search("alpha", -1));
        assertEquals(1, e.search("alpha", 5).size());
    }
}
