package sx.engine;

import java.util.Arrays;

public final class SetOps {
    private SetOps() {}

    /** @id CODE-ENGINE-001 @implements REQ-ENGINE-002 */
    public static int[] and(int[] a, int[] b) {
        int[] out = new int[Math.min(a.length, b.length)];
        int n = 0;
        int i = 0;
        int j = 0;
        while (i < a.length && j < b.length) {
            if (a[i] == b[j]) {
                out[n++] = a[i];
                i++;
                j++;
            } else if (a[i] < b[j]) {
                i++;
            } else {
                j++;
            }
        }
        return Arrays.copyOf(out, n);
    }

    /** @id CODE-ENGINE-002 @implements REQ-ENGINE-003 */
    public static int[] or(int[] a, int[] b) {
        int[] out = new int[a.length + b.length];
        int n = 0;
        int i = 0;
        int j = 0;
        while (i < a.length || j < b.length) {
            int v;
            if (j >= b.length || (i < a.length && a[i] < b[j])) {
                v = a[i++];
            } else if (i >= a.length || b[j] < a[i]) {
                v = b[j++];
            } else {
                v = a[i];
                i++;
                j++;
            }
            out[n++] = v;
        }
        return Arrays.copyOf(out, n);
    }

    /** @id CODE-ENGINE-003 @implements REQ-ENGINE-004 */
    public static int[] minus(int[] universe, int[] x) {
        int[] out = new int[universe.length];
        int n = 0;
        int j = 0;
        for (int v : universe) {
            while (j < x.length && x[j] < v) j++;
            if (j >= x.length || x[j] != v) {
                out[n++] = v;
            }
        }
        return Arrays.copyOf(out, n);
    }
}
