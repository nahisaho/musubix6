package ledger.audit;

import java.time.Instant;

public record AuditEntry(long seq, Instant timestamp, String actor, String action, String detail, String prevHash, String hash) {}
