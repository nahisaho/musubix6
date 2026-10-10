package ledger.accounts;

import ledger.money.Currency;

public final class Account {
    private final String code;
    private final String name;
    private final AccountType type;
    private final Currency currency;
    private final boolean active;
    private final String parent;

    /** @id CODE-ACCT-001 @implements REQ-ACCT-001 */
    public Account(String code, String name, AccountType type, Currency currency) {
        this(code, name, type, currency, true, null);
    }

    private Account(String code, String name, AccountType type, Currency currency, boolean active, String parent) {
        if (code == null || code.isBlank() || name == null || type == null || currency == null) {
            throw new IllegalArgumentException("invalid account");
        }
        this.code = code;
        this.name = name;
        this.type = type;
        this.currency = currency;
        this.active = active;
        this.parent = parent;
    }

    Account withActive(boolean a) { return new Account(code, name, type, currency, a, parent); }
    Account withParent(String p) { return new Account(code, name, type, currency, active, p); }

    public String code() { return code; }
    public String name() { return name; }
    public AccountType type() { return type; }
    public Currency currency() { return currency; }
    public boolean isActive() { return active; }
    public String parent() { return parent; }
}
