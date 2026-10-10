package ledger.accounts;

public enum AccountType {
    ASSET(Side.DEBIT), EXPENSE(Side.DEBIT), LIABILITY(Side.CREDIT), EQUITY(Side.CREDIT), REVENUE(Side.CREDIT);

    private final Side normal;

    AccountType(Side normal) { this.normal = normal; }

    /** @id CODE-ACCT-002 @implements REQ-ACCT-002 */
    public Side normalSide() { return normal; }
}
