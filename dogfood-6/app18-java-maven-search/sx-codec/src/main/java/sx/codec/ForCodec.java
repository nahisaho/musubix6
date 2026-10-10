package sx.codec;

public final class ForCodec {
    static final int MAX_COUNT = 1 << 20;

    private ForCodec() {}

    /** @id CODE-CODEC-005 @implements REQ-CODEC-008 REQ-CODEC-009 */
    public static int width(int[] block) {
        int max = 0;
        for (int v : block) {
            if (v < 0) {
                throw new IllegalArgumentException("negative value");
            }
            max |= v;
        }
        return 32 - Integer.numberOfLeadingZeros(max);
    }

    /** @id CODE-CODEC-006 @implements REQ-CODEC-008 REQ-CODEC-009 */
    public static byte[] pack(int[] block) {
        int w = width(block);
        byte[] head = VByte.encode(block.length);
        int payload = (int) (((long) block.length * w + 7) / 8);
        byte[] out = new byte[head.length + 1 + payload];
        System.arraycopy(head, 0, out, 0, head.length);
        out[head.length] = (byte) w;
        long bitPos = 0;
        for (int v : block) {
            for (int k = 0; k < w; k++, bitPos++) {
                if (((v >>> k) & 1) != 0) {
                    out[head.length + 1 + (int) (bitPos >>> 3)] |= (byte) (1 << (bitPos & 7));
                }
            }
        }
        return out;
    }

    /** @id CODE-CODEC-007 @implements REQ-CODEC-008 REQ-CODEC-010 REQ-CODEC-011 */
    public static int[] unpack(byte[] buf) {
        long r = VByte.readOne(buf, 0, "header");
        long count = r >>> 32;
        int i = (int) r;
        if (count > MAX_COUNT) {
            throw new CodecException("count " + count + " exceeds " + MAX_COUNT);
        }
        if (i >= buf.length) {
            throw new CodecException("missing width byte");
        }
        int w = buf[i++];
        if (w < 0 || w > 31) {
            throw new CodecException("invalid width " + w);
        }
        long payload = (count * w + 7) / 8;
        if (buf.length - i != payload) {
            throw new CodecException("payload size " + (buf.length - i) + " != expected " + payload);
        }
        int[] out = new int[(int) count];
        long bitPos = 0;
        for (int n = 0; n < out.length; n++) {
            int v = 0;
            for (int k = 0; k < w; k++, bitPos++) {
                if ((buf[i + (int) (bitPos >>> 3)] >>> (bitPos & 7) & 1) != 0) {
                    v |= 1 << k;
                }
            }
            out[n] = v;
        }
        return out;
    }
}
