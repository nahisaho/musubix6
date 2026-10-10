package ledger.accounts;

public class DuplicateAccountException extends RuntimeException {
    public DuplicateAccountException(String code) { super("duplicate account: " + code); }
}
