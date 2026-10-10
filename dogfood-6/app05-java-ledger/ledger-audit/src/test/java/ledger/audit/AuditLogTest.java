package ledger.audit;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class AuditLogTest {
    private static final Instant T0 = Instant.parse("2024-01-31T10:15:30Z");

    private static AuditLog log() {
        return new AuditLog(Clock.fixed(T0, ZoneOffset.UTC));
    }

    private static String sha(String s) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
    }

    /** @id TEST-AUDIT-001 @verifies REQ-AUDIT-001 */
    @Test
    void test_audit_001_sequence_and_clock() {
        AuditLog l = log();
        AuditEntry e1 = l.append("alice", "POST", "1");
        AuditEntry e2 = l.append("bob", "CLOSE", "2024-01");
        assertEquals(1L, e1.seq());
        assertEquals(2L, e2.seq());
        assertEquals(T0, e1.timestamp());
        assertEquals("bob", e2.actor());
        assertEquals(2, l.entries().size());
    }

    /** @id TEST-AUDIT-002 @verifies REQ-AUDIT-002 */
    @Test
    void test_audit_002_hash_chain_format() throws Exception {
        AuditLog l = log();
        AuditEntry e1 = l.append("alice", "POST", "a|b\\c");
        String expected1 = sha("0".repeat(64) + "|1|" + T0 + "|alice|POST|a\\|b\\\\c");
        assertEquals(expected1, e1.hash());
        assertEquals("0".repeat(64), e1.prevHash());
        AuditEntry e2 = l.append("bob", "REVERSE", "7");
        assertEquals(e1.hash(), e2.prevHash());
        assertEquals(sha(e1.hash() + "|2|" + T0 + "|bob|REVERSE|7"), e2.hash());
    }

    /** @id TEST-AUDIT-003 @verifies REQ-AUDIT-003 */
    @Test
    void test_audit_003_verify_clean() {
        AuditLog l = log();
        assertEquals(Optional.empty(), l.verify());
        l.append("a", "X", "1");
        l.append("a", "Y", "2");
        assertEquals(Optional.empty(), l.verify());
    }

    /** @id TEST-AUDIT-004 @verifies REQ-AUDIT-004 */
    @Test
    void test_audit_004_verify_detects_tamper() {
        AuditLog l = log();
        l.append("a", "X", "1");
        l.append("a", "Y", "2");
        l.append("a", "Z", "3");
        List<AuditEntry> copy = new ArrayList<>(l.entries());
        AuditEntry orig = copy.get(1);
        copy.set(1, new AuditEntry(orig.seq(), orig.timestamp(), orig.actor(), orig.action(), "tampered", orig.prevHash(), orig.hash()));
        assertEquals(Optional.of(2L), AuditLog.restore(Clock.fixed(T0, ZoneOffset.UTC), copy).verify());

        List<AuditEntry> dropped = new ArrayList<>(l.entries());
        dropped.remove(0);
        assertEquals(Optional.of(2L), AuditLog.restore(Clock.fixed(T0, ZoneOffset.UTC), dropped).verify());
    }

    /** @id TEST-AUDIT-005 @verifies REQ-AUDIT-005 */
    @Test
    void test_audit_005_entries_unmodifiable() {
        AuditLog l = log();
        l.append("a", "X", "1");
        List<AuditEntry> es = l.entries();
        assertThrows(UnsupportedOperationException.class, () -> es.clear());
        assertEquals(1, l.entries().size());
    }

    /** @id TEST-AUDIT-006 @verifies REQ-AUDIT-006 */
    @Test
    void test_audit_006_blank_rejected() {
        AuditLog l = log();
        assertThrows(IllegalArgumentException.class, () -> l.append(" ", "X", "d"));
        assertThrows(IllegalArgumentException.class, () -> l.append("a", "", "d"));
        assertThrows(IllegalArgumentException.class, () -> l.append(null, "X", "d"));
        assertEquals(0, l.entries().size());
        assertEquals(1L, l.append("a", "X", "d").seq());
    }
}
