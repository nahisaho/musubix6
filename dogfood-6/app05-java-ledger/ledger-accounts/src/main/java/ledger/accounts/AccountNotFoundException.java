package ledger.accounts;

public class AccountNotFoundException extends RuntimeException {
    public AccountNotFoundException(String code) { super("account not found: " + code); }
}
