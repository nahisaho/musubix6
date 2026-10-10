package sx.index;

import java.util.Arrays;
import sx.codec.GapCodec;
import sx.codec.VByte;

/** Block-compressed postings of one term: 128 postings per block plus a skip table. */
final class Frozen {
    static final int BLOCK = 128;

    final int count;
    final byte[][] docs;
    final byte[][] tfs;
    final byte[][] pos;
    final int[] firstDoc;
    final int[] lastDoc;

    /** @id CODE-INDEX-002 @implements REQ-INDEX-006 REQ-INDEX-008 */
    Frozen(int[] docIds, int[] tf, int[] flatPos) {
        count = docIds.length;
        int blocks = (count + BLOCK - 1) / BLOCK;
        docs = new byte[blocks][];
        tfs = new byte[blocks][];
        pos = new byte[blocks][];
        firstDoc = new int[blocks];
        lastDoc = new int[blocks];
        int p = 0;
        for (int b = 0; b < blocks; b++) {
            int from = b * BLOCK;
            int to = Math.min(count, from + BLOCK);
            int[] d = Arrays.copyOfRange(docIds, from, to);
            int[] t = Arrays.copyOfRange(tf, from, to);
            int total = 0;
            for (int x : t) total += x;
            int[] deltas = new int[total];
            int k = 0;
            for (int i = 0; i < t.length; i++) {
                int prev = 0;
                for (int j = 0; j < t[i]; j++) {
                    deltas[k++] = flatPos[p] - prev;
                    prev = flatPos[p++];
                }
            }
            docs[b] = GapCodec.encode(d);
            tfs[b] = VByte.encode(t);
            pos[b] = VByte.encode(deltas);
            firstDoc[b] = d[0];
            lastDoc[b] = d[d.length - 1];
        }
    }

    long bytes() {
        long s = 8L * firstDoc.length;
        for (int b = 0; b < docs.length; b++) {
            s += docs[b].length + tfs[b].length + pos[b].length;
        }
        return s;
    }
}
