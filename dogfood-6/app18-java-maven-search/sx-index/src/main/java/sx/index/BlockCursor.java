package sx.index;

import java.util.Arrays;
import java.util.Set;
import sx.codec.GapCodec;
import sx.codec.VByte;

/** Cursor over block-compressed postings; decodes one block at a time. */
final class BlockCursor implements PostingsCursor {
    private final Frozen f;
    private final Set<Integer> deleted;
    private int block = -1;
    private int i = -1;
    private int[] docs = new int[0];
    private int[] tfs = new int[0];
    private int[] flat = new int[0];
    private int[] posStart = new int[1];
    private boolean done;

    BlockCursor(Frozen f, Set<Integer> deleted) {
        this.f = f;
        this.deleted = deleted;
    }

    private void load(int b) {
        block = b;
        docs = GapCodec.decode(f.docs[b]);
        tfs = VByte.decode(f.tfs[b]);
        int[] deltas = VByte.decode(f.pos[b]);
        flat = new int[deltas.length];
        posStart = new int[docs.length + 1];
        int k = 0;
        for (int d = 0; d < docs.length; d++) {
            int prev = 0;
            for (int j = 0; j < tfs[d]; j++, k++) {
                prev += deltas[k];
                flat[k] = prev;
            }
            posStart[d + 1] = k;
        }
    }

    private boolean settle() {
        while (true) {
            while (i < docs.length && deleted.contains(docs[i])) i++;
            if (i < docs.length) return true;
            if (block + 1 >= f.docs.length) {
                done = true;
                return false;
            }
            load(block + 1);
            i = 0;
        }
    }

    @Override
    public boolean next() {
        if (done) return false;
        i++;
        return settle();
    }

    /** @id CODE-INDEX-004 @implements REQ-INDEX-007 */
    @Override
    public boolean advance(int target) {
        if (done) return false;
        if (i >= 0 && block >= 0 && docs[i] >= target) return true;
        int lo = Math.max(block, 0);
        int hi = f.lastDoc.length;
        while (lo < hi) {
            int mid = (lo + hi) >>> 1;
            if (f.lastDoc[mid] < target) lo = mid + 1;
            else hi = mid;
        }
        if (lo >= f.lastDoc.length) {
            done = true;
            return false;
        }
        if (lo != block) {
            load(lo);
            i = -1;
        }
        int a = Math.max(i, 0);
        int z = docs.length;
        while (a < z) {
            int mid = (a + z) >>> 1;
            if (docs[mid] < target) a = mid + 1;
            else z = mid;
        }
        i = a;
        return settle();
    }

    @Override
    public int doc() {
        return done ? NO_MORE : (i < 0 || block < 0 ? -1 : docs[i]);
    }

    @Override
    public int tf() {
        return tfs[i];
    }

    @Override
    public int[] positions() {
        return Arrays.copyOfRange(flat, posStart[i], posStart[i + 1]);
    }
}
