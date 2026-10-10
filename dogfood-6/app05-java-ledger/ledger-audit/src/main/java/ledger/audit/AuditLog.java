package ledger.audit;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

public class AuditLog {
    static final String GENESIS = "0".repeat(64);
    private final Clock clock;
    private final List<AuditEntry> entries = new ArrayList<>();

    public AuditLog(Clock clock) { this.clock = clock; }

    public static AuditLog restore(Clock clock, List<AuditEntry> entries) {
        AuditLog l = new AuditLog(clock);
        l.entries.addAll(entries);
        return l;
    }

    /** @id CODE-AUDIT-001 @implements REQ-AUDIT-001 REQ-AUDIT-006 */
    public AuditEntry append(String actor, String action, String detail) {
        if (actor == null || actor.isBlank() || action == null || action.isBlank()) {
            throw new IllegalArgumentException("actor and action are required");
        }
        long seq = entries.size() + 1L;
        String prev = entries.isEmpty() ? GENESIS : entries.get(entries.size() - 1).hash();
        Instant ts = clock.instant();
        String d = detail == null ? "" : detail;
        AuditEntry e = new AuditEntry(seq, ts, actor, action, d, prev, hash(prev, seq, ts, actor, action, d));
        entries.add(e);
        return e;
    }

    /** @id CODE-AUDIT-005 @implements REQ-AUDIT-005 */
    public List<AuditEntry> entries() { return Collections.unmodifiableList(entries); }

    /** @id CODE-AUDIT-003 @implements REQ-AUDIT-003 REQ-AUDIT-004 */
    public Optional<Long> verify() {
        String prev = GENESIS;
        long expectSeq = 1;
        for (AuditEntry e : entries) {
            if (e.seq() != expectSeq || !e.prevHash().equals(prev)
                    || !e.hash().equals(hash(prev, e.seq(), e.timestamp(), e.actor(), e.action(), e.detail()))) {
                return Optional.of(e.seq());
            }
            prev = e.hash();
            expectSeq++;
        }
        return Optional.empty();
    }

    /** @id CODE-AUDIT-002 @implements REQ-AUDIT-002 */
    static String hash(String prev, long seq, Instant ts, String actor, String action, String detail) {
        String input = String.join("|", prev, Long.toString(seq), ts.toString(), esc(actor), esc(action), esc(detail));
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static String esc(String s) { return s.replace("\\", "\\\\").replace("|", "\\|"); }
}
