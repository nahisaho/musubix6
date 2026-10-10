package sx.rank;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import sx.analysis.Analyzer;
import sx.index.InvertedIndex;

class RankTest {
    private static final double EPS = 1e-12;

    private static InvertedIndex small() {
        InvertedIndex idx = new InvertedIndex(Analyzer.standard());
        idx.add(0, "apple pie");
        idx.add(1, "apple apple tart");
        idx.add(2, "banana");
        return idx;
    }

    /** @id TEST-RANK-001 @verifies REQ-RANK-001 */
    @Test
    void test_rank_001_idf() {
        assertEquals(Math.log(1 + 7.5 / 3.5), Bm25.idf(10, 3), EPS);
        assertEquals(Math.log(1 + 0.5 / 10.5), Bm25.idf(10, 10), EPS);
        assertTrue(Bm25.idf(10, 10) > 0);
        assertEquals(Math.log(22), Bm25.idf(10, 0), EPS);
        assertEquals(Math.log(2), Bm25.idf(0, 0), EPS);
        assertThrows(IllegalArgumentException.class, () -> Bm25.idf(5, 6));
        assertThrows(IllegalArgumentException.class, () -> Bm25.idf(5, -1));
    }

    /** @id TEST-RANK-002 @verifies REQ-RANK-002 */
    @Test
    void test_rank_002_tf_saturation() {
        Bm25 m = Bm25.defaults();
        double idf = 2.0;
        double prev = 0;
        for (int tf = 1; tf <= 200; tf++) {
            double s = m.termScore(tf, 10, 10, idf);
            assertTrue(s > prev, "tf=" + tf);
            assertTrue(s < idf * (1.2 + 1), "tf=" + tf);
            prev = s;
        }
        assertEquals(idf * 2.2 / (1 + 1.2), m.termScore(1, 10, 10, idf), EPS);
    }

    /** @id TEST-RANK-003 @verifies REQ-RANK-003 */
    @Test
    void test_rank_003_length_normalization() {
        Bm25 m = Bm25.defaults();
        assertTrue(m.termScore(2, 10, 10, 1.5) > m.termScore(2, 100, 10, 1.5));
        assertTrue(m.termScore(2, 3, 10, 1.5) > m.termScore(2, 10, 10, 1.5));
    }

    /** @id TEST-RANK-004 @verifies REQ-RANK-004 */
    @Test
    void test_rank_004_degenerate_params() {
        Bm25 noLen = new Bm25(1.2, 0);
        assertEquals(noLen.termScore(2, 10, 10, 1.5), noLen.termScore(2, 1000, 10, 1.5), EPS);
        Bm25 binary = new Bm25(0, 0.75);
        assertEquals(1.5, binary.termScore(1, 10, 10, 1.5), EPS);
        assertEquals(1.5, binary.termScore(40, 500, 10, 1.5), EPS);
    }

    /** @id TEST-RANK-005 @verifies REQ-RANK-005 */
    @Test
    void test_rank_005_param_validation() {
        assertThrows(IllegalArgumentException.class, () -> new Bm25(-0.1, 0.5));
        assertThrows(IllegalArgumentException.class, () -> new Bm25(1, -0.1));
        assertThrows(IllegalArgumentException.class, () -> new Bm25(1, 1.1));
        assertThrows(IllegalArgumentException.class, () -> new Bm25(Double.NaN, 0.5));
        assertThrows(IllegalArgumentException.class, () -> new Bm25(1, Double.NaN));
        assertDoesNotThrow(() -> new Bm25(0, 0));
        assertDoesNotThrow(() -> new Bm25(0, 1));
    }

    /** @id TEST-RANK-006 @verifies REQ-RANK-006 */
    @Test
    void test_rank_006_topk_order() {
        TopK t = new TopK(10);
        t.offer(4, 1.0);
        t.offer(2, 3.0);
        t.offer(9, 1.0);
        t.offer(1, 3.0);
        t.offer(7, 2.0);
        assertEquals(List.of(1, 2, 7, 4, 9), t.results().stream().map(Hit::doc).toList());
        assertEquals(3.0, t.results().get(0).score(), 0);
    }

    /** @id TEST-RANK-007 @verifies REQ-RANK-007 */
    @Test
    void test_rank_007_topk_bounded() {
        TopK t = new TopK(2);
        t.offer(10, 1.0);
        t.offer(3, 1.0);
        t.offer(7, 1.0);
        t.offer(1, 0.5);
        t.offer(5, 2.0);
        assertEquals(List.of(5, 3), t.results().stream().map(Hit::doc).toList());
        assertThrows(IllegalArgumentException.class, () -> new TopK(0));
        assertThrows(IllegalArgumentException.class, () -> new TopK(-3));
        assertThrows(IllegalArgumentException.class, () -> t.offer(1, Double.NaN));
    }

    /** @id TEST-RANK-008 @verifies REQ-RANK-008 */
    @Test
    void test_rank_008_scorer_sums_terms() {
        InvertedIndex idx = small();
        Bm25 m = Bm25.defaults();
        Bm25Scorer sc = new Bm25Scorer(idx, m);
        double avg = idx.avgDocLength();
        double apple = Bm25.idf(3, 2);
        double pie = Bm25.idf(3, 1);
        Map<Integer, Double> r = sc.score(List.of("apple", "pie"));
        assertEquals(2, r.size());
        assertEquals(m.termScore(1, 2, avg, apple) + m.termScore(1, 2, avg, pie), r.get(0), EPS);
        assertEquals(m.termScore(2, 3, avg, apple), r.get(1), EPS);
        Map<Integer, Double> twice = sc.score(List.of("apple", "apple"));
        assertEquals(2 * m.termScore(1, 2, avg, apple), twice.get(0), EPS);
        assertTrue(sc.score(List.of("zzz")).isEmpty());
        idx.delete(1);
        Map<Integer, Double> after = new Bm25Scorer(idx, m).score(List.of("apple"));
        assertEquals(List.of(0), List.copyOf(after.keySet()));
        assertEquals(m.termScore(1, 2, idx.avgDocLength(), Bm25.idf(2, 1)), after.get(0), EPS);
    }

    /** @id TEST-RANK-009 @verifies REQ-RANK-009 */
    @Test
    void test_rank_009_empty_index() {
        InvertedIndex empty = new InvertedIndex(Analyzer.standard());
        assertTrue(new Bm25Scorer(empty, Bm25.defaults()).score(List.of("a", "b")).isEmpty());
        assertTrue(new Bm25Scorer(empty, Bm25.defaults()).top(List.of("a"), 5).isEmpty());
        double s = Bm25.defaults().termScore(0, 0, 0.0, Bm25.idf(0, 0));
        assertTrue(Double.isFinite(s));
        InvertedIndex stopOnly = new InvertedIndex(Analyzer.standard());
        stopOnly.add(0, "the of");
        assertTrue(new Bm25Scorer(stopOnly, Bm25.defaults()).score(List.of("the")).isEmpty());
        assertTrue(Double.isFinite(Bm25.defaults().termScore(3, 0, 0.0, 1.0)));
    }
}
