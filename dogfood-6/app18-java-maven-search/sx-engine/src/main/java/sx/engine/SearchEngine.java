package sx.engine;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import sx.analysis.Analyzer;
import sx.core.Token;
import sx.index.InvertedIndex;
import sx.query.And;
import sx.query.Not;
import sx.query.Or;
import sx.query.Phrase;
import sx.query.Query;
import sx.query.QueryParser;
import sx.query.Simplifier;
import sx.query.Term;
import sx.rank.Bm25;
import sx.rank.Bm25Scorer;
import sx.rank.Hit;
import sx.rank.TopK;

public final class SearchEngine {
    private final InvertedIndex index;
    private final QueryParser parser;
    private int nextId;

    public SearchEngine(Analyzer analyzer) {
        this.index = new InvertedIndex(analyzer);
        this.parser = new QueryParser(analyzer);
    }

    public int add(String text) {
        int id = nextId++;
        index.add(id, text);
        return id;
    }

    public void freeze() {
        index.freeze();
    }

    public boolean delete(int docId) {
        return index.delete(docId);
    }

    public InvertedIndex index() {
        return index;
    }

    /** @id CODE-ENGINE-006 @implements REQ-ENGINE-008 REQ-ENGINE-009 REQ-ENGINE-010 */
    public List<Hit> search(String query, int k) {
        if (k <= 0) {
            throw new IllegalArgumentException("k must be positive: " + k);
        }
        Query q = Simplifier.simplify(parser.parse(query));
        int[] docs = new Evaluator(index).eval(q);
        List<String> terms = new ArrayList<>();
        positiveTerms(q, terms);
        Map<Integer, Double> scores = new Bm25Scorer(index, Bm25.defaults()).score(terms);
        TopK top = new TopK(k);
        for (int d : docs) top.offer(d, scores.getOrDefault(d, 0.0));
        return top.results();
    }

    private static void positiveTerms(Query q, List<String> out) {
        switch (q) {
            case Term t -> out.add(t.term());
            case Phrase p -> {
                for (Token t : p.tokens()) out.add(t.term());
            }
            case And a -> a.children().forEach(c -> positiveTerms(c, out));
            case Or o -> o.children().forEach(c -> positiveTerms(c, out));
            case Not n -> { }
        }
    }
}
