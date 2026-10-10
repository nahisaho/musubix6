package sx.rank;

public final class Bm25 {
    private final double k1;
    private final double b;

    /** @id CODE-RANK-001 @implements REQ-RANK-005 */
    public Bm25(double k1, double b) {
        if (Double.isNaN(k1) || Double.isInfinite(k1) || k1 < 0) {
            throw new IllegalArgumentException("k1 must be finite and >= 0: " + k1);
        }
        if (Double.isNaN(b) || b < 0 || b > 1) {
            throw new IllegalArgumentException("b must be in [0,1]: " + b);
        }
        this.k1 = k1;
        this.b = b;
    }

    public static Bm25 defaults() {
        return new Bm25(1.2, 0.75);
    }

    /** @id CODE-RANK-002 @implements REQ-RANK-001 */
    public static double idf(long n, long df) {
        if (df < 0 || df > n) {
            throw new IllegalArgumentException("df must be in [0,N]: df=" + df + " N=" + n);
        }
        return Math.log(1.0 + (n - df + 0.5) / (df + 0.5));
    }

    /** @id CODE-RANK-003 @implements REQ-RANK-002 REQ-RANK-003 REQ-RANK-004 REQ-RANK-009 */
    public double termScore(int tf, int docLen, double avgDocLen, double idf) {
        double lenRatio = avgDocLen > 0 ? docLen / avgDocLen : 1.0;
        double norm = k1 * (1 - b + b * lenRatio);
        double denom = tf + norm;
        if (denom == 0) {
            return 0.0;
        }
        return idf * tf * (k1 + 1) / denom;
    }
}
