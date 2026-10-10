package ledger.period;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import ledger.accounts.Account;
import ledger.accounts.AccountType;
import ledger.accounts.Chart;
import ledger.accounts.Side;
import ledger.audit.AuditLog;
import ledger.journal.Ledger;
import ledger.journal.Line;
import ledger.money.Currency;
import ledger.money.Money;
import org.junit.jupiter.api.Test;

class PeriodLedgerTest {
    static final Currency USD = Currency.of("USD");
    static final YearMonth JAN = YearMonth.of(2024, 1);
    static final YearMonth FEB = YearMonth.of(2024, 2);
    static final YearMonth MAR = YearMonth.of(2024, 3);
    static final LocalDate JAN15 = LocalDate.of(2024, 1, 15);
    static final LocalDate FEB10 = LocalDate.of(2024, 2, 10);

    static Money usd(String v) { return Money.of(new BigDecimal(v), USD); }

    record Fx(PeriodLedger pl, Ledger ledger, AuditLog audit) {}

    static Fx fx() {
        Chart c = new Chart();
        c.add(new Account("1000", "Cash", AccountType.ASSET, USD));
        c.add(new Account("3000", "Retained earnings", AccountType.EQUITY, USD));
        c.add(new Account("3100", "Capital", AccountType.EQUITY, USD));
        c.add(new Account("4000", "Sales", AccountType.REVENUE, USD));
        c.add(new Account("5000", "Rent", AccountType.EXPENSE, USD));
        AuditLog au = new AuditLog(Clock.fixed(Instant.parse("2024-03-01T00:00:00Z"), ZoneOffset.UTC));
        Ledger lg = new Ledger(c, au, "tester");
        return new Fx(new PeriodLedger(lg, c, au, "tester", Map.of(USD, "3000")), lg, au);
    }

    static List<Line> pair(String dr, String cr, String amt) {
        return List.of(new Line(dr, Side.DEBIT, usd(amt)), new Line(cr, Side.CREDIT, usd(amt)));
    }

    /** @id TEST-PERIOD-001 @verifies REQ-PERIOD-001 */
    @Test
    void test_period_001_open_by_default() {
        Fx f = fx();
        assertTrue(f.pl().isOpen(JAN));
        assertTrue(f.pl().isOpen(YearMonth.of(1999, 12)));
        f.pl().close(JAN);
        assertFalse(f.pl().isOpen(JAN));
        assertTrue(f.pl().isOpen(FEB));
    }

    /** @id TEST-PERIOD-002 @verifies REQ-PERIOD-002 */
    @Test
    void test_period_002_post_into_closed_period_rejected() {
        Fx f = fx();
        f.pl().post(JAN15, "cap", pair("1000", "3100", "100"));
        f.pl().close(JAN);
        int before = f.ledger().entries().size();
        int auditBefore = f.audit().entries().size();
        assertThrows(PeriodClosedException.class, () -> f.pl().post(LocalDate.of(2024, 1, 31), "late", pair("1000", "3100", "5")));
        assertEquals(before, f.ledger().entries().size());
        assertEquals(auditBefore, f.audit().entries().size());
        assertEquals(FEB10, f.pl().post(FEB10, "ok", pair("1000", "3100", "5")).date());
    }

    /** @id TEST-PERIOD-003 @verifies REQ-PERIOD-003 */
    @Test
    void test_period_003_sequential_close() {
        Fx f = fx();
        f.pl().post(JAN15, "cap", pair("1000", "3100", "100"));
        assertThrows(PeriodException.class, () -> f.pl().close(FEB));
        assertTrue(f.pl().isOpen(FEB));
        f.pl().close(JAN);
        f.pl().close(FEB);
        assertFalse(f.pl().isOpen(FEB));
        Fx g = fx();
        g.pl().close(MAR);
        assertFalse(g.pl().isOpen(MAR));
    }

    /** @id TEST-PERIOD-004 @verifies REQ-PERIOD-004 */
    @Test
    void test_period_004_snapshot() {
        Fx f = fx();
        f.pl().post(JAN15, "cap", pair("1000", "3100", "100"));
        f.pl().post(FEB10, "cap2", pair("1000", "3100", "7"));
        Snapshot s = f.pl().close(JAN);
        assertEquals(JAN, s.period());
        assertEquals(usd("100"), s.balances().get("1000"));
        assertEquals(usd("100"), s.balances().get("3100"));
        assertEquals(2, s.balances().size());
    }

    /** @id TEST-PERIOD-005 @verifies REQ-PERIOD-005 */
    @Test
    void test_period_005_closing_entry() {
        Fx f = fx();
        f.pl().post(JAN15, "sale", pair("1000", "4000", "100"));
        f.pl().post(JAN15, "rent", pair("5000", "1000", "30"));
        Snapshot s = f.pl().close(JAN);
        assertEquals(usd("0"), f.ledger().balance("4000"));
        assertEquals(usd("0"), f.ledger().balance("5000"));
        assertEquals(usd("70"), f.ledger().balance("3000"));
        assertEquals(usd("70"), s.balances().get("3000"));
        assertEquals(usd("70"), s.balances().get("1000"));

        Fx g = fx();
        g.pl().post(JAN15, "rent", pair("5000", "1000", "30"));
        g.pl().close(JAN);
        assertEquals(usd("-30"), g.ledger().balance("3000"));
        assertEquals(usd("0"), g.ledger().balance("5000"));
        assertTrue(g.ledger().trialBalance().isBalanced());
    }

    /** @id TEST-PERIOD-006 @verifies REQ-PERIOD-006 */
    @Test
    void test_period_006_reopen() {
        Fx f = fx();
        f.pl().close(JAN);
        f.pl().close(FEB);
        assertThrows(PeriodException.class, () -> f.pl().reopen(JAN, "fix"));
        assertThrows(PeriodException.class, () -> f.pl().reopen(FEB, "  "));
        assertThrows(PeriodException.class, () -> f.pl().reopen(MAR, "never closed"));
        f.pl().reopen(FEB, "late invoice");
        assertTrue(f.pl().isOpen(FEB));
        assertFalse(f.pl().isOpen(JAN));
        var last = f.audit().entries().get(f.audit().entries().size() - 1);
        assertEquals("REOPEN", last.action());
        assertEquals("2024-02: late invoice", last.detail());
    }

    /** @id TEST-PERIOD-007 @verifies REQ-PERIOD-007 */
    @Test
    void test_period_007_close_audited() {
        Fx f = fx();
        f.pl().close(JAN);
        var last = f.audit().entries().get(f.audit().entries().size() - 1);
        assertEquals("CLOSE", last.action());
        assertEquals("2024-01", last.detail());
        assertEquals("tester", last.actor());
        assertEquals(java.util.Optional.empty(), f.audit().verify());
    }

    /** @id TEST-PERIOD-008 @verifies REQ-PERIOD-008 */
    @Test
    void test_period_008_reverse_respects_closed_period() {
        Fx f = fx();
        var e = f.pl().post(JAN15, "cap", pair("1000", "3100", "100"));
        f.pl().close(JAN);
        int before = f.ledger().entries().size();
        assertThrows(PeriodClosedException.class, () -> f.pl().reverse(e.id(), LocalDate.of(2024, 1, 31)));
        assertEquals(before, f.ledger().entries().size());
        var r = f.pl().reverse(e.id(), FEB10);
        assertEquals(FEB10, r.date());
        assertEquals(usd("0"), f.ledger().balance("1000"));
    }

    /** @id TEST-PERIOD-009 @verifies REQ-PERIOD-009 */
    @Test
    void test_period_009_no_out_of_order_close() {
        Fx f = fx();
        f.pl().close(MAR);
        f.pl().post(JAN15, "late booking", pair("1000", "4000", "50"));
        assertThrows(PeriodException.class, () -> f.pl().close(JAN));
        assertTrue(f.pl().isOpen(JAN));
        assertFalse(f.pl().isOpen(MAR));
        assertEquals(usd("0"), f.ledger().balance("3000"));
    }
}
