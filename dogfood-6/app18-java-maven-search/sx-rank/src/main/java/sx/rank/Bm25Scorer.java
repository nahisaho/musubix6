package sx.rank;

import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import sx.index.InvertedIndex;
import sx.index.PostingsCursor;

public final class Bm25Scorer {
    private final InvertedIndex index;
    private final Bm25 params;

    public Bm25Scorer(InvertedIndex index, Bm25 params) {
        this.index = index;
        this.params = params;
    }

    /** @id CODE-RANK-006 @implements REQ-RANK-008 REQ-RANK-009 */
    public Map<Integer, Double> score(List<String> terms) {
        Map<Integer, Double> acc = new TreeMap<>();
        int n = index.docCount();
        double avg = index.avgDocLength();
        for (String term : terms) {
            int df = index.docFreq(term);
            if (df == 0) {
                continue;
            }
            double idf = Bm25.idf(n, df);
            PostingsCursor c = index.cursor(term);
            while (c.next()) {
                double s = params.termScore(c.tf(), index.docLength(c.doc()), avg, idf);
                acc.merge(c.doc(), s, Double::sum);
            }
        }
        return acc;
    }

    public List<Hit> top(List<String> terms, int k) {
        TopK top = new TopK(k);
        for (Map.Entry<Integer, Double> e : score(terms).entrySet()) {
            top.offer(e.getKey(), e.getValue());
        }
        return top.results();
    }
}
