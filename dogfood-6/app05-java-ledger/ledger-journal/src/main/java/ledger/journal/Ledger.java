package ledger.journal;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import ledger.accounts.Account;
import ledger.accounts.Chart;
import ledger.accounts.Side;
import ledger.audit.AuditLog;
import ledger.money.Currency;
import ledger.money.CurrencyMismatchException;
import ledger.money.Money;

public class Ledger {
    private final Chart chart;
    private final AuditLog audit;
    private final String actor;
    private final List<JournalEntry> entries = new ArrayList<>();
    private final Set<Long> reversed = new HashSet<>();

    public Ledger(Chart chart, AuditLog audit, String actor) {
        this.chart = chart;
        this.audit = audit;
        this.actor = actor;
    }

    /** @id CODE-JRNL-002 @implements REQ-JRNL-002 REQ-JRNL-003 REQ-JRNL-004 REQ-JRNL-005 REQ-JRNL-006 */
    public JournalEntry post(LocalDate date, String memo, List<Line> lines) {
        return doPost(date, memo, lines, null, "POST");
    }

    private JournalEntry doPost(LocalDate date, String memo, List<Line> lines, Long reversalOf, String action) {
        List<Line> copy = List.copyOf(lines);
        if (copy.size() < 2) {
            throw new InvalidEntryException("an entry needs at least two lines");
        }
        Map<Currency, Money> net = new LinkedHashMap<>();
        for (Line l : copy) {
            Account a = chart.find(l.accountCode());
            if (!a.isActive()) {
                throw new InvalidEntryException("inactive account " + a.code());
            }
            if (!a.currency().equals(l.amount().currency())) {
                throw new CurrencyMismatchException(a.code() + " is " + a.currency());
            }
            Money signed = l.side() == Side.DEBIT ? l.amount() : l.amount().negate();
            net.merge(l.amount().currency(), signed, Money::add);
        }
        if (net.values().stream().anyMatch(m -> !m.isZero())) {
            throw new UnbalancedEntryException("debits != credits");
        }
        JournalEntry e = new JournalEntry(entries.size() + 1L, date, memo, copy, reversalOf);
        entries.add(e);
        audit.append(actor, action, Long.toString(e.id()));
        return e;
    }

    public List<JournalEntry> entries() { return Collections.unmodifiableList(entries); }

    /** @id CODE-JRNL-007 @implements REQ-JRNL-007 */
    public Money balance(String code) {
        Account a = chart.find(code);
        Money sum = Money.zero(a.currency());
        for (JournalEntry e : entries) {
            for (Line l : e.lines()) {
                if (l.accountCode().equals(code)) {
                    sum = l.side() == a.type().normalSide() ? sum.add(l.amount()) : sum.subtract(l.amount());
                }
            }
        }
        return sum;
    }

    /** @id CODE-JRNL-013 @implements REQ-JRNL-012 */
    public JournalEntry reverse(long id, LocalDate date) {
        JournalEntry orig = original(id);
        List<Line> swapped = new ArrayList<>();
        for (Line l : orig.lines()) {
            swapped.add(new Line(l.accountCode(), l.side() == Side.DEBIT ? Side.CREDIT : Side.DEBIT, l.amount()));
        }
        JournalEntry r = doPost(date, "reversal of " + id, swapped, id, "REVERSE");
        reversed.add(id);
        return r;
    }

    /** @id CODE-JRNL-008 @implements REQ-JRNL-008 REQ-JRNL-009 */
    public JournalEntry reverse(long id) {
        return reverse(id, original(id).date());
    }

    private JournalEntry original(long id) {
        if (id < 1 || id > entries.size()) {
            throw new InvalidEntryException("unknown entry " + id);
        }
        JournalEntry orig = entries.get((int) id - 1);
        if (orig.reversalOf() != null || reversed.contains(id)) {
            throw new InvalidEntryException("entry " + id + " cannot be reversed");
        }
        return orig;
    }

    /** @id CODE-JRNL-012 @implements REQ-JRNL-010 */
    public TrialBalance trialBalance() {
        Map<Currency, Money> d = new LinkedHashMap<>();
        Map<Currency, Money> c = new LinkedHashMap<>();
        for (JournalEntry e : entries) {
            for (Line l : e.lines()) {
                (l.side() == Side.DEBIT ? d : c).merge(l.amount().currency(), l.amount(), Money::add);
            }
        }
        return new TrialBalance(d, c);
    }
}
