package ledger.money;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

public final class Money {
    private final BigDecimal amount;
    private final Currency currency;

    private Money(BigDecimal amount, Currency currency) {
        this.amount = amount;
        this.currency = currency;
    }

    /** @id CODE-MONEY-002 @implements REQ-MONEY-002 */
    public static Money of(BigDecimal amount, Currency currency) {
        return new Money(amount.setScale(currency.digits(), RoundingMode.HALF_EVEN), currency);
    }

    public static Money zero(Currency currency) { return of(BigDecimal.ZERO, currency); }

    public BigDecimal amount() { return amount; }
    public Currency currency() { return currency; }

    /** @id CODE-MONEY-003 @implements REQ-MONEY-003 */
    public Money add(Money o) { check(o); return of(amount.add(o.amount), currency); }
    public Money subtract(Money o) { check(o); return of(amount.subtract(o.amount), currency); }

    private void check(Money o) {
        if (!currency.equals(o.currency)) {
            throw new CurrencyMismatchException(currency + " vs " + o.currency);
        }
    }

    /** @id CODE-MONEY-004 @implements REQ-MONEY-004 */
    public List<Money> allocate(List<Integer> ratios) {
        if (ratios.isEmpty() || ratios.stream().anyMatch(r -> r < 0) || ratios.stream().mapToLong(Integer::longValue).sum() <= 0) {
            throw new IllegalArgumentException("invalid ratios");
        }
        BigInteger units = amount.movePointRight(currency.digits()).toBigIntegerExact();
        BigInteger sign = BigInteger.valueOf(units.signum());
        BigInteger abs = units.abs();
        BigInteger total = BigInteger.valueOf(ratios.stream().mapToLong(Integer::longValue).sum());
        List<BigInteger> parts = new ArrayList<>();
        BigInteger given = BigInteger.ZERO;
        for (int r : ratios) {
            BigInteger p = abs.multiply(BigInteger.valueOf(r)).divide(total);
            parts.add(p);
            given = given.add(p);
        }
        int left = abs.subtract(given).intValueExact();
        List<Money> out = new ArrayList<>();
        for (int i = 0; i < parts.size(); i++) {
            BigInteger p = parts.get(i).add(i < left ? BigInteger.ONE : BigInteger.ZERO).multiply(sign);
            out.add(new Money(new BigDecimal(p, currency.digits()), currency));
        }
        return out;
    }

    /** @id CODE-MONEY-005 @implements REQ-MONEY-005 */
    public Money convert(BigDecimal rate, Currency target) {
        if (rate.signum() <= 0) {
            throw new IllegalArgumentException("rate must be positive");
        }
        return of(amount.multiply(rate), target);
    }

    /** @id CODE-MONEY-006 @implements REQ-MONEY-006 */
    public Money negate() { return of(amount.negate(), currency); }
    public boolean isZero() { return amount.signum() == 0; }

    @Override public boolean equals(Object o) {
        return o instanceof Money m && m.currency.equals(currency) && m.amount.compareTo(amount) == 0;
    }
    @Override public int hashCode() { return currency.hashCode() * 31 + amount.stripTrailingZeros().hashCode(); }
    @Override public String toString() { return amount.toPlainString() + " " + currency; }
}
