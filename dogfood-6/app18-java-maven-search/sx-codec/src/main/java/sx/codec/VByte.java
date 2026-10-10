package sx.codec;

import java.io.ByteArrayOutputStream;
import java.util.Arrays;

public final class VByte {
    private VByte() {}

    /** @id CODE-CODEC-001 @implements REQ-CODEC-001 REQ-CODEC-002 REQ-CODEC-003 */
    public static byte[] encode(int... values) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(values.length * 2);
        for (int v : values) {
            if (v < 0) {
                throw new IllegalArgumentException("negative value: " + v);
            }
            while (v >= 0x80) {
                out.write((v & 0x7F) | 0x80);
                v >>>= 7;
            }
            out.write(v);
        }
        return out.toByteArray();
    }

    /** Reads one value at off; returns (value << 32) | nextOffset. */
    static long readOne(byte[] buf, int off, String what) {
        long acc = 0;
        int shift = 0;
        int i = off;
        while (true) {
            if (i >= buf.length) {
                throw new CodecException("truncated " + what);
            }
            int b = buf[i++] & 0xFF;
            acc |= (long) (b & 0x7F) << shift;
            if (b < 0x80) {
                return (acc << 32) | i;
            }
            shift += 7;
            if (shift > 28) {
                throw new CodecException(what + " longer than 5 bytes");
            }
        }
    }

    /** @id CODE-CODEC-002 @implements REQ-CODEC-001 REQ-CODEC-004 REQ-CODEC-005 */
    public static int[] decode(byte[] buf) {
        int[] out = new int[Math.max(4, buf.length)];
        int n = 0;
        int i = 0;
        while (i < buf.length) {
            long r = readOne(buf, i, "value at end of input");
            long acc = r >>> 32;
            i = (int) r;
            if (acc > Integer.MAX_VALUE) {
                throw new CodecException("value exceeds Integer.MAX_VALUE");
            }
            out[n++] = (int) acc;
        }
        return Arrays.copyOf(out, n);
    }
}
