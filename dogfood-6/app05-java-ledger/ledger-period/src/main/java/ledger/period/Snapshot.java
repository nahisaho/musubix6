package ledger.period;

import java.time.YearMonth;
import java.util.Map;
import ledger.money.Money;

public record Snapshot(YearMonth period, Map<String, Money> balances) {}
