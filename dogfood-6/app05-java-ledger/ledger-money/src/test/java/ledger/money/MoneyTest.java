package ledger.money;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class MoneyTest {
    /** @id TEST-MONEY-001 @verifies REQ-MONEY-001 */
    @Test
    void test_money_001_currency_digits() {
        assertEquals(2, Currency.of("USD").digits());
        assertEquals(0, Currency.of("JPY").digits());
        assertEquals(3, Currency.of("KWD").digits());
        assertThrows(IllegalArgumentException.class, () -> Currency.of("XXQ"));
    }

    /** @id TEST-MONEY-002 @verifies REQ-MONEY-002 */
    @Test
    void test_money_002_half_even_rounding() {
        Currency usd = Currency.of("USD");
        assertEquals(new BigDecimal("2.34"), Money.of(new BigDecimal("2.345"), usd).amount());
        assertEquals(new BigDecimal("2.36"), Money.of(new BigDecimal("2.355"), usd).amount());
        assertEquals(new BigDecimal("2"), Money.of(new BigDecimal("2.5"), Currency.of("JPY")).amount());
        assertEquals(new BigDecimal("4"), Money.of(new BigDecimal("3.5"), Currency.of("JPY")).amount());
    }

    /** @id TEST-MONEY-003 @verifies REQ-MONEY-003 */
    @Test
    void test_money_003_add_subtract_mismatch() {
        Currency usd = Currency.of("USD");
        Money a = Money.of(new BigDecimal("10.10"), usd);
        Money b = Money.of(new BigDecimal("0.25"), usd);
        assertEquals(Money.of(new BigDecimal("10.35"), usd), a.add(b));
        assertEquals(Money.of(new BigDecimal("9.85"), usd), a.subtract(b));
        Money y = Money.of(new BigDecimal("1"), Currency.of("JPY"));
        assertThrows(CurrencyMismatchException.class, () -> a.add(y));
        assertThrows(CurrencyMismatchException.class, () -> a.subtract(y));
    }

    /** @id TEST-MONEY-004 @verifies REQ-MONEY-004 */
    @Test
    void test_money_004_allocate_preserves_sum() {
        Currency usd = Currency.of("USD");
        Money total = Money.of(new BigDecimal("100.00"), usd);
        List<Money> parts = total.allocate(List.of(1, 1, 1));
        assertEquals(List.of(new BigDecimal("33.34"), new BigDecimal("33.33"), new BigDecimal("33.33")),
                parts.stream().map(Money::amount).toList());
        Money sum = parts.stream().reduce(Money.zero(usd), Money::add);
        assertEquals(total, sum);
        assertThrows(IllegalArgumentException.class, () -> total.allocate(List.of(0, 0)));
        assertThrows(IllegalArgumentException.class, () -> total.allocate(List.of(1, -1)));
        assertThrows(IllegalArgumentException.class, () -> total.allocate(List.of()));
        Money neg = Money.of(new BigDecimal("-0.05"), usd);
        assertEquals(neg, neg.allocate(List.of(1, 1)).stream().reduce(Money.zero(usd), Money::add));
    }

    /** @id TEST-MONEY-005 @verifies REQ-MONEY-005 */
    @Test
    void test_money_005_convert() {
        Money usd = Money.of(new BigDecimal("10.00"), Currency.of("USD"));
        Money jpy = usd.convert(new BigDecimal("151.255"), Currency.of("JPY"));
        assertEquals(Currency.of("JPY"), jpy.currency());
        assertEquals(0, new BigDecimal("1513").compareTo(jpy.amount()));
        assertThrows(IllegalArgumentException.class, () -> usd.convert(BigDecimal.ZERO, Currency.of("JPY")));
        assertThrows(IllegalArgumentException.class, () -> usd.convert(new BigDecimal("-1"), Currency.of("JPY")));
    }

    /** @id TEST-MONEY-006 @verifies REQ-MONEY-006 */
    @Test
    void test_money_006_equality_negate_zero() {
        Currency usd = Currency.of("USD");
        Money a = Money.of(new BigDecimal("5"), usd);
        Money b = Money.of(new BigDecimal("5.00"), usd);
        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
        assertNotEquals(a, Money.of(new BigDecimal("5"), Currency.of("JPY")));
        assertEquals(Money.of(new BigDecimal("-5"), usd), a.negate());
        assertTrue(Money.zero(usd).isZero());
        assertTrue(Money.zero(usd).negate().isZero());
        assertEquals(Money.zero(usd), Money.zero(usd).negate());
        assertFalse(a.isZero());
    }
}
