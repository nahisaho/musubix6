package sx.codec;

public final class GapCodec {
    private GapCodec() {}

    /** @id CODE-CODEC-003 @implements REQ-CODEC-006 REQ-CODEC-007 */
    public static byte[] encode(int[] sorted) {
        int[] gaps = new int[sorted.length];
        for (int i = 0; i < sorted.length; i++) {
            if (sorted[i] < 0) {
                throw new IllegalArgumentException("negative value at " + i);
            }
            if (i > 0 && sorted[i] <= sorted[i - 1]) {
                throw new IllegalArgumentException("not strictly increasing at " + i);
            }
            gaps[i] = i == 0 ? sorted[0] : sorted[i] - sorted[i - 1];
        }
        return VByte.encode(gaps);
    }

    /** @id CODE-CODEC-004 @implements REQ-CODEC-006 REQ-CODEC-007 */
    public static int[] decode(byte[] buf) {
        int[] gaps = VByte.decode(buf);
        long acc = 0;
        for (int i = 0; i < gaps.length; i++) {
            if (i > 0 && gaps[i] == 0) {
                throw new CodecException("zero gap at " + i);
            }
            acc += gaps[i];
            if (acc > Integer.MAX_VALUE) {
                throw new CodecException("gap sum overflows int at " + i);
            }
            gaps[i] = (int) acc;
        }
        return gaps;
    }
}
