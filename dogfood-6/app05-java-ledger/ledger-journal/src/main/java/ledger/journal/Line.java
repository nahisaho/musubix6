package ledger.journal;

import ledger.accounts.Side;
import ledger.money.Money;

public record Line(String accountCode, Side side, Money amount) {
    /** @id CODE-JRNL-001 @implements REQ-JRNL-001 */
    public Line {
        if (accountCode == null || accountCode.isBlank() || side == null || amount == null || amount.amount().signum() <= 0) {
            throw new IllegalArgumentException("invalid line");
        }
    }
}
