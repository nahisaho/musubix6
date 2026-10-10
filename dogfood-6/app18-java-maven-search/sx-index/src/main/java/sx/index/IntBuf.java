package sx.index;

import java.util.Arrays;

final class IntBuf {
    private int[] a = new int[8];
    private int n;

    void add(int v) {
        if (n == a.length) {
            a = Arrays.copyOf(a, n * 2);
        }
        a[n++] = v;
    }

    int get(int i) {
        return a[i];
    }

    int size() {
        return n;
    }

    int[] toArray() {
        return Arrays.copyOf(a, n);
    }
}
