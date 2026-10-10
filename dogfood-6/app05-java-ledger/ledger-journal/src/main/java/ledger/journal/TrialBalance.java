package ledger.journal;

import java.util.Map;
import ledger.money.Currency;
import ledger.money.Money;

public record TrialBalance(Map<Currency, Money> debits, Map<Currency, Money> credits) {
    /** @id CODE-JRNL-010 @implements REQ-JRNL-010 */
    public boolean isBalanced() {
        return debits.keySet().equals(credits.keySet())
                && debits.entrySet().stream().allMatch(e -> e.getValue().equals(credits.get(e.getKey())));
    }
}
