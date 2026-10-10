package sx.engine;

import java.util.Arrays;
import java.util.List;
import sx.core.Token;
import sx.index.InvertedIndex;
import sx.index.PostingsCursor;
import sx.query.And;
import sx.query.Not;
import sx.query.Or;
import sx.query.Phrase;
import sx.query.Query;
import sx.query.Term;

public final class Evaluator {
    private final InvertedIndex index;

    public Evaluator(InvertedIndex index) {
        this.index = index;
    }

    /** @id CODE-ENGINE-004 @implements REQ-ENGINE-001 REQ-ENGINE-004 */
    public int[] eval(Query q) {
        return switch (q) {
            case Term t -> docsOf(t.term());
            case Phrase p -> phrase(p);
            case And a -> {
                int[] acc = null;
                for (Query c : a.children()) {
                    int[] r = eval(c);
                    acc = acc == null ? r : SetOps.and(acc, r);
                }
                yield acc == null ? new int[0] : acc;
            }
            case Or o -> {
                int[] acc = new int[0];
                for (Query c : o.children()) acc = SetOps.or(acc, eval(c));
                yield acc;
            }
            case Not n -> SetOps.minus(index.liveDocs(), eval(n.child()));
        };
    }

    private int[] docsOf(String term) {
        int[] out = new int[Math.max(index.docFreq(term), 0)];
        int n = 0;
        PostingsCursor c = index.cursor(term);
        while (c.next()) out[n++] = c.doc();
        return Arrays.copyOf(out, n);
    }

    /** @id CODE-ENGINE-005 @implements REQ-ENGINE-005 REQ-ENGINE-006 REQ-ENGINE-007 */
    private int[] phrase(Phrase p) {
        List<Token> toks = p.tokens();
        PostingsCursor[] cs = new PostingsCursor[toks.size()];
        for (int i = 0; i < cs.length; i++) cs[i] = index.cursor(toks.get(i).term());
        int[] out = new int[16];
        int n = 0;
        int target = 0;
        int doc;
        while ((doc = align(cs, target)) >= 0) {
            if (matchesAt(cs, toks)) {
                if (n == out.length) out = Arrays.copyOf(out, n * 2);
                out[n++] = doc;
            }
            target = doc + 1;
        }
        return Arrays.copyOf(out, n);
    }

    /** Leapfrogs all cursors to the first common doc >= target, or -1 when exhausted. */
    private static int align(PostingsCursor[] cs, int target) {
        int doc = target;
        boolean aligned = false;
        while (!aligned) {
            aligned = true;
            for (PostingsCursor c : cs) {
                if (!c.advance(doc)) {
                    return -1;
                }
                if (c.doc() > doc) {
                    doc = c.doc();
                    aligned = false;
                }
            }
        }
        return doc;
    }

    private static boolean matchesAt(PostingsCursor[] cs, List<Token> toks) {
        int[] first = cs[0].positions();
        int base = toks.get(0).position();
        for (int p : first) {
            boolean ok = true;
            for (int i = 1; i < cs.length && ok; i++) {
                ok = Arrays.binarySearch(cs[i].positions(), p + toks.get(i).position() - base) >= 0;
            }
            if (ok) {
                return true;
            }
        }
        return false;
    }
}
