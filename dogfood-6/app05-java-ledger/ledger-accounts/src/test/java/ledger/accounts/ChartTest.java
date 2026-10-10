package ledger.accounts;

import static org.junit.jupiter.api.Assertions.*;

import ledger.money.Currency;
import org.junit.jupiter.api.Test;

class ChartTest {
    private static final Currency USD = Currency.of("USD");

    /** @id TEST-ACCT-001 @verifies REQ-ACCT-001 */
    @Test
    void test_acct_001_account_validation() {
        Account a = new Account("1000", "Cash", AccountType.ASSET, USD);
        assertEquals("1000", a.code());
        assertEquals(AccountType.ASSET, a.type());
        assertThrows(IllegalArgumentException.class, () -> new Account(" ", "Cash", AccountType.ASSET, USD));
        assertThrows(IllegalArgumentException.class, () -> new Account(null, "Cash", AccountType.ASSET, USD));
        assertThrows(IllegalArgumentException.class, () -> new Account("1", null, AccountType.ASSET, USD));
        assertThrows(IllegalArgumentException.class, () -> new Account("1", "Cash", null, USD));
        assertThrows(IllegalArgumentException.class, () -> new Account("1", "Cash", AccountType.ASSET, null));
    }

    /** @id TEST-ACCT-002 @verifies REQ-ACCT-002 */
    @Test
    void test_acct_002_normal_side() {
        assertEquals(Side.DEBIT, AccountType.ASSET.normalSide());
        assertEquals(Side.DEBIT, AccountType.EXPENSE.normalSide());
        assertEquals(Side.CREDIT, AccountType.LIABILITY.normalSide());
        assertEquals(Side.CREDIT, AccountType.EQUITY.normalSide());
        assertEquals(Side.CREDIT, AccountType.REVENUE.normalSide());
    }

    /** @id TEST-ACCT-003 @verifies REQ-ACCT-003 */
    @Test
    void test_acct_003_duplicate_code() {
        Chart c = new Chart();
        c.add(new Account("1000", "Cash", AccountType.ASSET, USD));
        assertThrows(DuplicateAccountException.class, () -> c.add(new Account("1000", "Other", AccountType.EXPENSE, USD)));
        assertEquals("Cash", c.find("1000").name());
    }

    /** @id TEST-ACCT-004 @verifies REQ-ACCT-004 */
    @Test
    void test_acct_004_unknown_account() {
        Chart c = new Chart();
        assertThrows(AccountNotFoundException.class, () -> c.find("9999"));
    }

    /** @id TEST-ACCT-005 @verifies REQ-ACCT-005 */
    @Test
    void test_acct_005_deactivate() {
        Chart c = new Chart();
        c.add(new Account("1000", "Cash", AccountType.ASSET, USD));
        assertTrue(c.find("1000").isActive());
        c.deactivate("1000");
        assertFalse(c.find("1000").isActive());
        assertThrows(AccountNotFoundException.class, () -> c.deactivate("2"));
    }

    /** @id TEST-ACCT-006 @verifies REQ-ACCT-006 */
    @Test
    void test_acct_006_parent_rules() {
        Chart c = new Chart();
        c.add(new Account("1000", "Assets", AccountType.ASSET, USD));
        c.add(new Account("1100", "Cash", AccountType.ASSET, USD), "1000");
        assertEquals("1000", c.find("1100").parent());
        assertThrows(AccountNotFoundException.class, () -> c.add(new Account("1200", "x", AccountType.ASSET, USD), "0000"));
        assertThrows(IllegalArgumentException.class, () -> c.add(new Account("4000", "Sales", AccountType.REVENUE, USD), "1000"));
        assertThrows(AccountNotFoundException.class, () -> c.find("4000"));
    }
}
