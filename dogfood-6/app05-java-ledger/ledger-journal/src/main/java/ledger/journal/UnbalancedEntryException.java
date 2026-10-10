package ledger.journal;

public class UnbalancedEntryException extends RuntimeException {
    public UnbalancedEntryException(String message) { super(message); }
}
