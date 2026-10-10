package sx.index;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;
import sx.analysis.Analyzer;
import sx.core.Posting;

class IndexTest {
    private static InvertedIndex newIndex() {
        return new InvertedIndex(Analyzer.standard());
    }

    private static InvertedIndex bigIndex() {
        InvertedIndex idx = newIndex();
        for (int i = 0; i < 1000; i++) {
            StringBuilder sb = new StringBuilder("common");
            if (i % 2 == 0) sb.append(" even");
            if (i % 97 == 0) sb.append(" rare");
            if (i % 10 == 0) sb.append(" tens common tens");
            idx.add(i, sb.toString());
        }
        return idx;
    }

    private static List<String> snapshot(InvertedIndex idx, String term) {
        List<String> out = new ArrayList<>();
        PostingsCursor c = idx.cursor(term);
        while (c.next()) {
            out.add(c.doc() + ":" + c.tf() + ":" + Arrays.toString(c.positions()));
        }
        return out;
    }

    private static List<Integer> docs(InvertedIndex idx, String term) {
        List<Integer> out = new ArrayList<>();
        PostingsCursor c = idx.cursor(term);
        while (c.next()) out.add(c.doc());
        return out;
    }

    /** @id TEST-INDEX-001 @verifies REQ-INDEX-001 */
    @Test
    void test_index_001_add_and_cursor() {
        InvertedIndex idx = newIndex();
        idx.add(0, "quick brown fox quick");
        idx.add(1, "the fox");
        PostingsCursor q = idx.cursor("quick");
        assertTrue(q.next());
        assertEquals(0, q.doc());
        assertEquals(2, q.tf());
        assertArrayEquals(new int[] {0, 3}, q.positions());
        assertFalse(q.next());
        assertEquals(List.of("0:1:[2]", "1:1:[1]"), snapshot(idx, "fox"));
    }

    /** @id TEST-INDEX-002 @verifies REQ-INDEX-002 */
    @Test
    void test_index_002_doc_order() {
        InvertedIndex idx = newIndex();
        idx.add(5, "alpha");
        assertThrows(IllegalArgumentException.class, () -> idx.add(5, "beta"));
        assertThrows(IllegalArgumentException.class, () -> idx.add(3, "beta"));
        assertThrows(IllegalArgumentException.class, () -> idx.add(-1, "beta"));
        idx.add(9, "beta");
        assertEquals(List.of(9), docs(idx, "beta"));
    }

    /** @id TEST-INDEX-003 @verifies REQ-INDEX-003 */
    @Test
    void test_index_003_statistics() {
        InvertedIndex idx = newIndex();
        assertEquals(0.0, idx.avgDocLength());
        idx.add(0, "red apple pie");
        idx.add(1, "apple apple");
        assertEquals(2, idx.docCount());
        assertEquals(3, idx.docLength(0));
        assertEquals(2, idx.docLength(1));
        assertEquals(2, idx.docFreq("apple"));
        assertEquals(3, idx.collectionFreq("apple"));
        assertEquals(1, idx.docFreq("pie"));
        assertEquals(2.5, idx.avgDocLength(), 1e-12);
        assertThrows(IllegalArgumentException.class, () -> idx.docLength(7));
    }

    /** @id TEST-INDEX-004 @verifies REQ-INDEX-004 */
    @Test
    void test_index_004_unknown_term() {
        InvertedIndex idx = newIndex();
        idx.add(0, "alpha");
        PostingsCursor c = idx.cursor("zzz");
        assertFalse(c.next());
        assertFalse(c.advance(0));
        assertEquals(0, idx.docFreq("zzz"));
        idx.freeze();
        assertFalse(idx.cursor("zzz").next());
    }

    /** @id TEST-INDEX-005 @verifies REQ-INDEX-005 */
    @Test
    void test_index_005_freeze_state() {
        InvertedIndex idx = newIndex();
        idx.add(0, "alpha beta");
        assertFalse(idx.isFrozen());
        idx.freeze();
        assertTrue(idx.isFrozen());
        assertThrows(IllegalStateException.class, () -> idx.add(1, "gamma"));
        idx.freeze();
        assertTrue(idx.isFrozen());
        assertEquals(List.of(0), docs(idx, "alpha"));
    }

    /** @id TEST-INDEX-006 @verifies REQ-INDEX-006 */
    @Test
    void test_index_006_freeze_preserves_postings() {
        InvertedIndex idx = bigIndex();
        List<String> terms = List.of("common", "even", "rare", "tens");
        List<List<String>> before = new ArrayList<>();
        for (String t : terms) before.add(snapshot(idx, t));
        assertEquals(1000, before.get(0).size());
        assertEquals(500, before.get(1).size());
        idx.freeze();
        for (int i = 0; i < terms.size(); i++) {
            assertEquals(before.get(i), snapshot(idx, terms.get(i)), terms.get(i));
        }
        assertEquals("0:3:[0, 3, 4]".substring(0, 2), snapshot(idx, "common").get(0).substring(0, 2));
    }

    /** @id TEST-INDEX-007 @verifies REQ-INDEX-007 */
    @Test
    void test_index_007_advance() {
        for (boolean frozen : new boolean[] {false, true}) {
            InvertedIndex idx = bigIndex();
            if (frozen) idx.freeze();
            PostingsCursor c = idx.cursor("even");
            assertTrue(c.advance(0));
            assertEquals(0, c.doc());
            assertTrue(c.advance(5));
            assertEquals(6, c.doc());
            assertTrue(c.advance(6));
            assertEquals(6, c.doc());
            assertTrue(c.advance(3));
            assertEquals(6, c.doc());
            assertTrue(c.advance(511));
            assertEquals(512, c.doc());
            assertTrue(c.next());
            assertEquals(514, c.doc());
            assertFalse(c.advance(999));
            assertFalse(c.next());
            PostingsCursor f = idx.cursor("even");
            assertTrue(f.advance(997));
            assertEquals(998, f.doc());
            assertFalse(idx.cursor("even").advance(1000));
        }
    }

    /** @id TEST-INDEX-008 @verifies REQ-INDEX-008 */
    @Test
    void test_index_008_compression_ratio() {
        InvertedIndex idx = newIndex();
        for (int i = 0; i < 5000; i++) idx.add(i, "common token");
        idx.freeze();
        assertTrue(idx.rawBytes() > 0);
        assertTrue(idx.compressedBytes() < idx.rawBytes() / 2,
                "compressed=" + idx.compressedBytes() + " raw=" + idx.rawBytes());
    }

    /** @id TEST-INDEX-009 @verifies REQ-INDEX-009 */
    @Test
    void test_index_009_delete() {
        for (boolean frozen : new boolean[] {false, true}) {
            InvertedIndex idx = newIndex();
            idx.add(0, "cat dog");
            idx.add(1, "cat");
            idx.add(2, "dog dog bird");
            if (frozen) idx.freeze();
            assertTrue(idx.delete(1));
            assertFalse(idx.delete(1));
            assertFalse(idx.delete(99));
            assertEquals(List.of(0), docs(idx, "cat"));
            assertEquals(1, idx.docFreq("cat"));
            assertEquals(2, idx.docCount());
            assertEquals(2.5, idx.avgDocLength(), 1e-12);
            assertEquals(2, idx.collectionFreq("dog") - 1);
            PostingsCursor c = idx.cursor("cat");
            assertTrue(c.advance(1) == false);
            assertTrue(idx.delete(0));
            assertEquals(0, idx.docFreq("cat"));
            assertFalse(idx.cursor("cat").next());
        }
    }

    /** @id TEST-INDEX-010 @verifies REQ-INDEX-010 */
    @Test
    void test_index_010_posting_invariants() {
        assertThrows(IllegalArgumentException.class, () -> new Posting(-1, new int[] {0}));
        assertThrows(IllegalArgumentException.class, () -> new Posting(1, new int[0]));
        assertThrows(IllegalArgumentException.class, () -> new Posting(1, new int[] {2, 2}));
        assertThrows(IllegalArgumentException.class, () -> new Posting(1, new int[] {3, 1}));
        assertThrows(IllegalArgumentException.class, () -> new Posting(1, new int[] {-1, 1}));
        Posting p = new Posting(4, new int[] {0, 5, 9});
        assertEquals(3, p.tf());
        assertEquals(4, p.docId());
    }
}
