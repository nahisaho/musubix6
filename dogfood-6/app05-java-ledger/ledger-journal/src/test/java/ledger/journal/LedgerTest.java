package ledger.journal;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import ledger.accounts.Account;
import ledger.accounts.AccountNotFoundException;
import ledger.accounts.AccountType;
import ledger.accounts.Chart;
import ledger.accounts.Side;
import ledger.audit.AuditEntry;
import ledger.audit.AuditLog;
import ledger.money.Currency;
import ledger.money.CurrencyMismatchException;
import ledger.money.Money;
import org.junit.jupiter.api.Test;

class LedgerTest {
    static final Currency USD = Currency.of("USD");
    static final Currency JPY = Currency.of("JPY");
    static final LocalDate D = LocalDate.of(2024, 1, 15);

    static Money usd(String v) { return Money.of(new BigDecimal(v), USD); }

    static Chart chart() {
        Chart c = new Chart();
        c.add(new Account("1000", "Cash", AccountType.ASSET, USD));
        c.add(new Account("4000", "Sales", AccountType.REVENUE, USD));
        c.add(new Account("5000", "Rent", AccountType.EXPENSE, USD));
        c.add(new Account("1500", "Yen cash", AccountType.ASSET, JPY));
        c.add(new Account("4500", "Yen sales", AccountType.REVENUE, JPY));
        c.add(new Account("9999", "Dormant", AccountType.ASSET, USD));
        c.deactivate("9999");
        return c;
    }

    static AuditLog audit() { return new AuditLog(Clock.fixed(Instant.parse("2024-01-15T00:00:00Z"), ZoneOffset.UTC)); }

    static Ledger ledger() { return new Ledger(chart(), audit(), "tester"); }

    static List<Line> sale(String amount) {
        return List.of(new Line("1000", Side.DEBIT, usd(amount)), new Line("4000", Side.CREDIT, usd(amount)));
    }

    /** @id TEST-JRNL-001 @verifies REQ-JRNL-001 */
    @Test
    void test_jrnl_001_line_validation() {
        Line l = new Line("1000", Side.DEBIT, usd("5"));
        assertEquals("1000", l.accountCode());
        assertThrows(IllegalArgumentException.class, () -> new Line("", Side.DEBIT, usd("5")));
        assertThrows(IllegalArgumentException.class, () -> new Line("1000", null, usd("5")));
        assertThrows(IllegalArgumentException.class, () -> new Line("1000", Side.DEBIT, null));
        assertThrows(IllegalArgumentException.class, () -> new Line("1000", Side.DEBIT, usd("0")));
        assertThrows(IllegalArgumentException.class, () -> new Line("1000", Side.DEBIT, usd("-1")));
    }

    /** @id TEST-JRNL-002 @verifies REQ-JRNL-002 */
    @Test
    void test_jrnl_002_min_two_lines() {
        Ledger lg = ledger();
        assertThrows(InvalidEntryException.class, () -> lg.post(D, "m", List.of()));
        assertThrows(InvalidEntryException.class, () -> lg.post(D, "m", List.of(new Line("1000", Side.DEBIT, usd("1")))));
        assertEquals(0, lg.entries().size());
    }

    /** @id TEST-JRNL-003 @verifies REQ-JRNL-003 */
    @Test
    void test_jrnl_003_unbalanced() {
        Ledger lg = ledger();
        List<Line> bad = List.of(new Line("1000", Side.DEBIT, usd("10")), new Line("4000", Side.CREDIT, usd("9.99")));
        assertThrows(UnbalancedEntryException.class, () -> lg.post(D, "m", bad));
        assertEquals(0, lg.entries().size());
        assertEquals(usd("0"), lg.balance("1000"));
        List<Line> perCurrency = List.of(new Line("1000", Side.DEBIT, usd("10")), new Line("4500", Side.CREDIT, Money.of(new BigDecimal("10"), JPY)));
        assertThrows(UnbalancedEntryException.class, () -> lg.post(D, "m", perCurrency));
    }

    /** @id TEST-JRNL-004 @verifies REQ-JRNL-004 */
    @Test
    void test_jrnl_004_currency_must_match_account() {
        Ledger lg = ledger();
        List<Line> bad = List.of(new Line("1000", Side.DEBIT, Money.of(new BigDecimal("100"), JPY)), new Line("4500", Side.CREDIT, Money.of(new BigDecimal("100"), JPY)));
        assertThrows(CurrencyMismatchException.class, () -> lg.post(D, "m", bad));
        assertEquals(0, lg.entries().size());
    }

    /** @id TEST-JRNL-005 @verifies REQ-JRNL-005 */
    @Test
    void test_jrnl_005_unknown_or_inactive_account() {
        Ledger lg = ledger();
        List<Line> unknown = List.of(new Line("1000", Side.DEBIT, usd("1")), new Line("0000", Side.CREDIT, usd("1")));
        assertThrows(AccountNotFoundException.class, () -> lg.post(D, "m", unknown));
        List<Line> inactive = List.of(new Line("9999", Side.DEBIT, usd("1")), new Line("4000", Side.CREDIT, usd("1")));
        assertThrows(InvalidEntryException.class, () -> lg.post(D, "m", inactive));
        assertEquals(0, lg.entries().size());
    }

    /** @id TEST-JRNL-006 @verifies REQ-JRNL-006 */
    @Test
    void test_jrnl_006_post_ids_and_audit() {
        AuditLog au = audit();
        Ledger lg = new Ledger(chart(), au, "tester");
        JournalEntry e1 = lg.post(D, "sale", sale("10"));
        JournalEntry e2 = lg.post(D, "sale 2", sale("20"));
        assertEquals(1L, e1.id());
        assertEquals(2L, e2.id());
        assertEquals(D, e1.date());
        assertEquals(2, lg.entries().size());
        AuditEntry last = au.entries().get(1);
        assertEquals("POST", last.action());
        assertEquals("2", last.detail());
        assertEquals("tester", last.actor());
        assertEquals(2, au.entries().size());
        assertThrows(InvalidEntryException.class, () -> lg.post(D, "bad", List.of()));
        assertEquals(2, au.entries().size());
    }

    /** @id TEST-JRNL-007 @verifies REQ-JRNL-007 */
    @Test
    void test_jrnl_007_balance_by_normal_side() {
        Ledger lg = ledger();
        lg.post(D, "sale", sale("100.50"));
        lg.post(D, "rent", List.of(new Line("5000", Side.DEBIT, usd("30")), new Line("1000", Side.CREDIT, usd("30"))));
        assertEquals(usd("70.50"), lg.balance("1000"));
        assertEquals(usd("100.50"), lg.balance("4000"));
        assertEquals(usd("30"), lg.balance("5000"));
        assertEquals(Money.zero(JPY), lg.balance("1500"));
        assertThrows(AccountNotFoundException.class, () -> lg.balance("0000"));
    }

    /** @id TEST-JRNL-008 @verifies REQ-JRNL-008 */
    @Test
    void test_jrnl_008_reverse() {
        AuditLog au = audit();
        Ledger lg = new Ledger(chart(), au, "tester");
        JournalEntry e = lg.post(D, "sale", sale("10"));
        JournalEntry r = lg.reverse(e.id());
        assertEquals(2L, r.id());
        assertEquals(e.id(), r.reversalOf());
        assertEquals(Side.CREDIT, r.lines().get(0).side());
        assertEquals(Side.DEBIT, r.lines().get(1).side());
        assertEquals(usd("0"), lg.balance("1000"));
        assertEquals(usd("0"), lg.balance("4000"));
        assertEquals("REVERSE", au.entries().get(au.entries().size() - 1).action());
        assertEquals("2", au.entries().get(au.entries().size() - 1).detail());
    }

    /** @id TEST-JRNL-009 @verifies REQ-JRNL-009 */
    @Test
    void test_jrnl_009_reverse_once_only() {
        Ledger lg = ledger();
        JournalEntry e = lg.post(D, "sale", sale("10"));
        JournalEntry r = lg.reverse(e.id());
        assertThrows(InvalidEntryException.class, () -> lg.reverse(e.id()));
        assertThrows(InvalidEntryException.class, () -> lg.reverse(r.id()));
        assertEquals(2, lg.entries().size());
    }

    /** @id TEST-JRNL-010 @verifies REQ-JRNL-010 */
    @Test
    void test_jrnl_010_trial_balance() {
        Ledger lg = ledger();
        lg.post(D, "a", sale("10.01"));
        lg.post(D, "b", List.of(new Line("5000", Side.DEBIT, usd("3")), new Line("1000", Side.CREDIT, usd("1")), new Line("4000", Side.CREDIT, usd("2"))));
        lg.post(D, "c", List.of(new Line("1500", Side.DEBIT, Money.of(new BigDecimal("500"), JPY)), new Line("4500", Side.CREDIT, Money.of(new BigDecimal("500"), JPY))));
        lg.reverse(2L);
        TrialBalance tb = lg.trialBalance();
        assertEquals(usd("16.01"), tb.debits().get(USD));
        assertEquals(tb.debits().get(USD), tb.credits().get(USD));
        assertEquals(Money.of(new BigDecimal("500"), JPY), tb.debits().get(JPY));
        assertEquals(tb.debits().get(JPY), tb.credits().get(JPY));
        assertTrue(tb.isBalanced());
    }

    /** @id TEST-JRNL-011 @verifies REQ-JRNL-011 */
    @Test
    void test_jrnl_011_immutability() {
        Ledger lg = ledger();
        List<Line> lines = new ArrayList<>(sale("10"));
        JournalEntry e = lg.post(D, "sale", lines);
        lines.clear();
        assertEquals(2, e.lines().size());
        assertThrows(UnsupportedOperationException.class, () -> e.lines().clear());
        assertThrows(UnsupportedOperationException.class, () -> lg.entries().clear());
        assertEquals(1, lg.entries().size());
        assertEquals(usd("10"), lg.balance("1000"));
    }

    /** @id TEST-JRNL-012 @verifies REQ-JRNL-012 */
    @Test
    void test_jrnl_012_reverse_with_date() {
        Ledger lg = ledger();
        JournalEntry e = lg.post(D, "sale", sale("10"));
        LocalDate later = LocalDate.of(2024, 3, 2);
        JournalEntry r = lg.reverse(e.id(), later);
        assertEquals(later, r.date());
        assertEquals(e.id(), r.reversalOf());
        assertEquals(usd("0"), lg.balance("1000"));
        assertEquals(D, lg.reverse(lg.post(D, "x", sale("1")).id()).date());
        assertThrows(InvalidEntryException.class, () -> lg.reverse(e.id(), later));
    }
}
