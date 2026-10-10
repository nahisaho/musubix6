namespace Fraud.Audit;

public record AuditEntry(long Seq, DateTimeOffset Time, string Actor, string Action, string Subject, string Detail, string PrevHash, string Hash);

public record VerifyResult(bool Ok, long? BadSeq);
