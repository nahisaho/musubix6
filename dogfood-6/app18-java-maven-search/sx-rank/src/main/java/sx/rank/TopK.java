package sx.rank;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.PriorityQueue;

public final class TopK {
    /** true when a ranks strictly before b. */
    private static boolean better(Hit a, Hit b) {
        return a.score() > b.score() || (a.score() == b.score() && a.doc() < b.doc());
    }

    private static final Comparator<Hit> BEST_FIRST =
            (a, b) -> better(a, b) ? -1 : better(b, a) ? 1 : 0;

    private final int k;
    private final PriorityQueue<Hit> heap = new PriorityQueue<>(BEST_FIRST.reversed());

    /** @id CODE-RANK-004 @implements REQ-RANK-007 */
    public TopK(int k) {
        if (k <= 0) {
            throw new IllegalArgumentException("k must be positive: " + k);
        }
        this.k = k;
    }

    /** @id CODE-RANK-005 @implements REQ-RANK-006 REQ-RANK-007 */
    public void offer(int doc, double score) {
        if (Double.isNaN(score)) {
            throw new IllegalArgumentException("NaN score for doc " + doc);
        }
        Hit h = new Hit(doc, score);
        if (heap.size() < k) {
            heap.add(h);
        } else if (better(h, heap.peek())) {
            heap.poll();
            heap.add(h);
        }
    }

    public List<Hit> results() {
        List<Hit> out = new ArrayList<>(heap);
        out.sort(BEST_FIRST);
        return out;
    }
}
