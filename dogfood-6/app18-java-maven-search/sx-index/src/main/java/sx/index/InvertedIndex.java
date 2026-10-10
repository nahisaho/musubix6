package sx.index;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import sx.analysis.Analyzer;
import sx.core.Token;

public final class InvertedIndex {
    private final Analyzer analyzer;
    private final Map<String, TermData> terms = new HashMap<>();
    private final TreeMap<Integer, Integer> lengths = new TreeMap<>();
    private final Map<Integer, Map<String, Integer>> docTerms = new HashMap<>();
    private final Set<Integer> deleted = new HashSet<>();
    private long liveLengthSum;
    private int last = -1;
    private boolean frozen;

    public InvertedIndex(Analyzer analyzer) {
        this.analyzer = analyzer;
    }

    /** @id CODE-INDEX-005 @implements REQ-INDEX-001 REQ-INDEX-002 REQ-INDEX-005 */
    public void add(int docId, String text) {
        if (frozen) {
            throw new IllegalStateException("index is frozen");
        }
        if (docId <= last) {
            throw new IllegalArgumentException("docId " + docId + " must be greater than " + last);
        }
        Map<String, IntBuf> byTerm = new HashMap<>();
        int len = 0;
        for (Token t : analyzer.analyze(text)) {
            byTerm.computeIfAbsent(t.term(), k -> new IntBuf()).add(t.position());
            len++;
        }
        Map<String, Integer> tfByTerm = new HashMap<>();
        for (Map.Entry<String, IntBuf> e : byTerm.entrySet()) {
            TermData td = terms.computeIfAbsent(e.getKey(), k -> new TermData());
            IntBuf ps = e.getValue();
            td.docs.add(docId);
            td.tfs.add(ps.size());
            for (int k = 0; k < ps.size(); k++) td.positions.add(ps.get(k));
            td.liveDf++;
            td.liveCf += ps.size();
            tfByTerm.put(e.getKey(), ps.size());
        }
        docTerms.put(docId, tfByTerm);
        lengths.put(docId, len);
        liveLengthSum += len;
        last = docId;
    }

    /** @id CODE-INDEX-006 @implements REQ-INDEX-005 REQ-INDEX-006 */
    public void freeze() {
        if (frozen) {
            return;
        }
        for (TermData td : terms.values()) {
            td.frozen = new Frozen(td.docs.toArray(), td.tfs.toArray(), td.positions.toArray());
        }
        frozen = true;
    }

    public boolean isFrozen() {
        return frozen;
    }

    /** @id CODE-INDEX-007 @implements REQ-INDEX-009 */
    public boolean delete(int docId) {
        if (!lengths.containsKey(docId) || deleted.contains(docId)) {
            return false;
        }
        deleted.add(docId);
        liveLengthSum -= lengths.get(docId);
        for (Map.Entry<String, Integer> e : docTerms.get(docId).entrySet()) {
            TermData td = terms.get(e.getKey());
            td.liveDf--;
            td.liveCf -= e.getValue();
        }
        return true;
    }

    /** @id CODE-INDEX-008 @implements REQ-INDEX-004 REQ-INDEX-007 */
    public PostingsCursor cursor(String term) {
        TermData td = terms.get(term);
        if (td == null) {
            return new EmptyCursor();
        }
        return td.frozen != null ? new BlockCursor(td.frozen, deleted) : new ArrayCursor(td, deleted);
    }

    /** @id CODE-INDEX-009 @implements REQ-INDEX-003 */
    public int docCount() {
        return lengths.size() - deleted.size();
    }

    public int docLength(int docId) {
        Integer len = lengths.get(docId);
        if (len == null || deleted.contains(docId)) {
            throw new IllegalArgumentException("unknown doc " + docId);
        }
        return len;
    }

    public int docFreq(String term) {
        TermData td = terms.get(term);
        return td == null ? 0 : td.liveDf;
    }

    public long collectionFreq(String term) {
        TermData td = terms.get(term);
        return td == null ? 0 : td.liveCf;
    }

    public double avgDocLength() {
        int n = docCount();
        return n == 0 ? 0.0 : (double) liveLengthSum / n;
    }

    public int[] liveDocs() {
        return lengths.keySet().stream().filter(d -> !deleted.contains(d)).mapToInt(Integer::intValue).toArray();
    }

    /** @id CODE-INDEX-010 @implements REQ-INDEX-008 */
    public long rawBytes() {
        long s = 0;
        for (TermData td : terms.values()) {
            s += 4L * (td.docs.size() + td.tfs.size() + td.positions.size());
        }
        return s;
    }

    public long compressedBytes() {
        if (!frozen) {
            throw new IllegalStateException("index is not frozen");
        }
        long s = 0;
        for (TermData td : terms.values()) {
            s += td.frozen.bytes();
        }
        return s;
    }
}
