package sx.index;

import java.util.Set;

/** Cursor over open postings; skips tombstoned docs. */
final class ArrayCursor implements PostingsCursor {
    private final int[] docs;
    private final int[] tfs;
    private final int[] posStart;
    private final int[] flat;
    private final Set<Integer> deleted;
    private int i = -1;
    private boolean done;

    ArrayCursor(TermData t, Set<Integer> deleted) {
        this.docs = t.docs.toArray();
        this.tfs = t.tfs.toArray();
        this.flat = t.positions.toArray();
        this.posStart = new int[docs.length + 1];
        for (int k = 0; k < docs.length; k++) posStart[k + 1] = posStart[k] + tfs[k];
        this.deleted = deleted;
    }

    private boolean settle() {
        while (i < docs.length && deleted.contains(docs[i])) i++;
        if (i >= docs.length) {
            done = true;
            return false;
        }
        return true;
    }

    @Override
    public boolean next() {
        if (done) return false;
        i++;
        return settle();
    }

    /** @id CODE-INDEX-003 @implements REQ-INDEX-007 */
    @Override
    public boolean advance(int target) {
        if (done) return false;
        if (i >= 0 && docs[i] >= target) return true;
        int lo = Math.max(i, 0);
        int hi = docs.length;
        while (lo < hi) {
            int mid = (lo + hi) >>> 1;
            if (docs[mid] < target) lo = mid + 1;
            else hi = mid;
        }
        i = lo;
        return settle();
    }

    @Override
    public int doc() {
        return done || i < 0 ? (done ? NO_MORE : -1) : docs[i];
    }

    @Override
    public int tf() {
        return tfs[i];
    }

    @Override
    public int[] positions() {
        return java.util.Arrays.copyOfRange(flat, posStart[i], posStart[i + 1]);
    }
}
