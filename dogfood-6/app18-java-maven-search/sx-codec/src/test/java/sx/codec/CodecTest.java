package sx.codec;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Arrays;
import java.util.Random;
import org.junit.jupiter.api.Test;

class CodecTest {
    private static byte[] b(int... xs) {
        byte[] r = new byte[xs.length];
        for (int i = 0; i < xs.length; i++) r[i] = (byte) xs[i];
        return r;
    }

    /** @id TEST-CODEC-001 @verifies REQ-CODEC-001 */
    @Test
    void test_codec_001_vbyte_roundtrip() {
        int[] vs = {0, 1, 127, 128, 255, 16383, 16384, 2097151, 2097152, Integer.MAX_VALUE};
        assertArrayEquals(vs, VByte.decode(VByte.encode(vs)));
        assertArrayEquals(new int[0], VByte.decode(new byte[0]));
    }

    /** @id TEST-CODEC-002 @verifies REQ-CODEC-002 */
    @Test
    void test_codec_002_vbyte_sizes() {
        assertEquals(1, VByte.encode(127).length);
        assertArrayEquals(b(0x80, 0x01), VByte.encode(128));
        assertEquals(2, VByte.encode(16383).length);
        assertEquals(3, VByte.encode(16384).length);
        assertArrayEquals(b(0xFF, 0xFF, 0xFF, 0xFF, 0x07), VByte.encode(Integer.MAX_VALUE));
    }

    /** @id TEST-CODEC-003 @verifies REQ-CODEC-003 */
    @Test
    void test_codec_003_vbyte_negative() {
        assertThrows(IllegalArgumentException.class, () -> VByte.encode(-1));
        assertThrows(IllegalArgumentException.class, () -> VByte.encode(1, 2, -5));
    }

    /** @id TEST-CODEC-004 @verifies REQ-CODEC-004 */
    @Test
    void test_codec_004_vbyte_truncated() {
        assertThrows(CodecException.class, () -> VByte.decode(b(0x80)));
        assertThrows(CodecException.class, () -> VByte.decode(b(0x01, 0x81)));
    }

    /** @id TEST-CODEC-005 @verifies REQ-CODEC-005 */
    @Test
    void test_codec_005_vbyte_overlong_overflow() {
        assertThrows(CodecException.class, () -> VByte.decode(b(0x80, 0x80, 0x80, 0x80, 0x80, 0x01)));
        assertThrows(CodecException.class, () -> VByte.decode(b(0xFF, 0xFF, 0xFF, 0xFF, 0x08)));
        assertArrayEquals(new int[] {Integer.MAX_VALUE}, VByte.decode(b(0xFF, 0xFF, 0xFF, 0xFF, 0x07)));
    }

    /** @id TEST-CODEC-006 @verifies REQ-CODEC-006 */
    @Test
    void test_codec_006_gap_roundtrip() {
        int[][] cases = {{}, {0}, {0, 1, 2}, {5, 1000, 1_000_000, Integer.MAX_VALUE}};
        for (int[] c : cases) {
            assertArrayEquals(c, GapCodec.decode(GapCodec.encode(c)));
        }
        assertArrayEquals(VByte.encode(5, 995, 999_000), GapCodec.encode(new int[] {5, 1000, 1_000_000}));
    }

    /** @id TEST-CODEC-007 @verifies REQ-CODEC-007 */
    @Test
    void test_codec_007_gap_invalid() {
        assertThrows(IllegalArgumentException.class, () -> GapCodec.encode(new int[] {1, 1}));
        assertThrows(IllegalArgumentException.class, () -> GapCodec.encode(new int[] {3, 2}));
        assertThrows(IllegalArgumentException.class, () -> GapCodec.encode(new int[] {-1, 4}));
        assertThrows(CodecException.class, () -> GapCodec.decode(VByte.encode(Integer.MAX_VALUE, 1)));
        assertThrows(CodecException.class, () -> GapCodec.decode(VByte.encode(5, 0)));
    }

    /** @id TEST-CODEC-008 @verifies REQ-CODEC-008 */
    @Test
    void test_codec_008_for_roundtrip_and_width() {
        assertEquals(3, ForCodec.width(new int[] {1, 2, 3, 7}));
        assertEquals(31, ForCodec.width(new int[] {Integer.MAX_VALUE}));
        assertEquals(1, ForCodec.width(new int[] {1}));
        byte[] packed = ForCodec.pack(new int[] {1, 2, 3, 7});
        assertEquals(4, packed.length);
        assertEquals(3, packed[1]);
        Random rnd = new Random(42);
        for (int len = 0; len <= 130; len += 13) {
            for (int bits = 1; bits <= 31; bits += 5) {
                int[] v = new int[len];
                for (int i = 0; i < len; i++) v[i] = bits == 31 ? rnd.nextInt(Integer.MAX_VALUE) : rnd.nextInt(1 << bits);
                assertArrayEquals(v, ForCodec.unpack(ForCodec.pack(v)), "len=" + len + " bits=" + bits);
            }
        }
    }

    /** @id TEST-CODEC-009 @verifies REQ-CODEC-009 */
    @Test
    void test_codec_009_for_all_zero() {
        byte[] packed = ForCodec.pack(new int[] {0, 0, 0, 0});
        assertArrayEquals(b(4, 0), packed);
        assertArrayEquals(new int[] {0, 0, 0, 0}, ForCodec.unpack(packed));
        assertArrayEquals(b(0, 0), ForCodec.pack(new int[0]));
    }

    /** @id TEST-CODEC-010 @verifies REQ-CODEC-010 */
    @Test
    void test_codec_010_for_malformed() {
        byte[] ok = ForCodec.pack(new int[] {1, 2, 3, 7});
        assertThrows(CodecException.class, () -> ForCodec.unpack(Arrays.copyOf(ok, ok.length - 1)));
        assertThrows(CodecException.class, () -> ForCodec.unpack(Arrays.copyOf(ok, ok.length + 1)));
        assertThrows(CodecException.class, () -> ForCodec.unpack(b(1, 32, 0, 0, 0, 0)));
        assertThrows(CodecException.class, () -> ForCodec.unpack(new byte[0]));
    }

    private static byte[] withWidth0(int count) {
        byte[] h = VByte.encode(count);
        byte[] o = Arrays.copyOf(h, h.length + 1);
        return o;
    }

    /** @id TEST-CODEC-011 @verifies REQ-CODEC-011 */
    @Test
    void test_codec_011_for_count_cap() {
        assertThrows(CodecException.class, () -> ForCodec.unpack(withWidth0(2_000_000)));
        assertThrows(CodecException.class, () -> ForCodec.unpack(withWidth0(1_048_577)));
        assertEquals(1_048_576, ForCodec.unpack(withWidth0(1_048_576)).length);
        assertEquals(0, ForCodec.unpack(b(0, 0)).length);
    }
}
