package ledger.period;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import ledger.accounts.Account;
import ledger.accounts.AccountType;
import ledger.accounts.Chart;
import ledger.accounts.Side;
import ledger.audit.AuditLog;
import ledger.journal.JournalEntry;
import ledger.journal.Ledger;
import ledger.journal.Line;
import ledger.money.Currency;
import ledger.money.Money;

public class PeriodLedger {
    private final Ledger ledger;
    private final Chart chart;
    private final AuditLog audit;
    private final String actor;
    private final Map<Currency, String> retained;
    private final TreeSet<YearMonth> closed = new TreeSet<>();

    public PeriodLedger(Ledger ledger, Chart chart, AuditLog audit, String actor, Map<Currency, String> retainedEarnings) {
        this.ledger = ledger;
        this.chart = chart;
        this.audit = audit;
        this.actor = actor;
        this.retained = Map.copyOf(retainedEarnings);
    }

    /** @id CODE-PERIOD-001 @implements REQ-PERIOD-001 */
    public boolean isOpen(YearMonth p) { return !closed.contains(p); }

    /** @id CODE-PERIOD-002 @implements REQ-PERIOD-002 */
    public JournalEntry post(LocalDate date, String memo, List<Line> lines) {
        requireOpen(date);
        return ledger.post(date, memo, lines);
    }

    private void requireOpen(LocalDate date) {
        if (!isOpen(YearMonth.from(date))) {
            throw new PeriodClosedException("period " + YearMonth.from(date) + " is closed");
        }
    }

    /** @id CODE-PERIOD-003 @implements REQ-PERIOD-003 REQ-PERIOD-004 REQ-PERIOD-005 REQ-PERIOD-007 REQ-PERIOD-009 */
    public Snapshot close(YearMonth p) {
        if (closed.contains(p)) {
            throw new PeriodException("period " + p + " is already closed");
        }
        if (!closed.isEmpty() && closed.last().isAfter(p)) {
            throw new PeriodException("a later period " + closed.last() + " is already closed");
        }
        for (JournalEntry e : ledger.entries()) {
            YearMonth ep = YearMonth.from(e.date());
            if (ep.isBefore(p) && isOpen(ep)) {
                throw new PeriodException("earlier period " + ep + " has postings and is still open");
            }
        }
        postClosingEntry(p);
        closed.add(p);
        audit.append(actor, "CLOSE", p.toString());
        return new Snapshot(p, balancesUpTo(p));
    }

    private Map<String, Money> balancesUpTo(YearMonth p) {
        Map<String, Money> out = new LinkedHashMap<>();
        LocalDate end = p.atEndOfMonth();
        for (JournalEntry e : ledger.entries()) {
            if (e.date().isAfter(end)) {
                continue;
            }
            for (Line l : e.lines()) {
                Account a = chart.find(l.accountCode());
                Money signed = l.side() == a.type().normalSide() ? l.amount() : l.amount().negate();
                out.merge(a.code(), signed, Money::add);
            }
        }
        return out;
    }

    private void postClosingEntry(YearMonth p) {
        List<Line> lines = new ArrayList<>();
        Map<Currency, Money> net = new LinkedHashMap<>();
        for (Map.Entry<String, Money> b : balancesUpTo(p).entrySet()) {
            Account a = chart.find(b.getKey());
            Money bal = b.getValue();
            if (bal.isZero() || (a.type() != AccountType.REVENUE && a.type() != AccountType.EXPENSE)) {
                continue;
            }
            Side closeSide = bal.amount().signum() > 0 ? opposite(a.type().normalSide()) : a.type().normalSide();
            Money abs = bal.amount().signum() > 0 ? bal : bal.negate();
            lines.add(new Line(a.code(), closeSide, abs));
            net.merge(abs.currency(), closeSide == Side.DEBIT ? abs : abs.negate(), Money::add);
        }
        for (Map.Entry<Currency, Money> n : net.entrySet()) {
            Money diff = n.getValue();
            if (diff.isZero()) {
                continue;
            }
            String code = retained.get(n.getKey());
            if (code == null) {
                throw new PeriodException("no retained earnings account for " + n.getKey());
            }
            lines.add(diff.amount().signum() > 0
                    ? new Line(code, Side.CREDIT, diff)
                    : new Line(code, Side.DEBIT, diff.negate()));
        }
        if (!lines.isEmpty()) {
            ledger.post(p.atEndOfMonth(), "closing " + p, lines);
        }
    }

    private static Side opposite(Side s) { return s == Side.DEBIT ? Side.CREDIT : Side.DEBIT; }

    /** @id CODE-PERIOD-008 @implements REQ-PERIOD-008 */
    public JournalEntry reverse(long id, LocalDate date) {
        requireOpen(date);
        return ledger.reverse(id, date);
    }

    /** @id CODE-PERIOD-006 @implements REQ-PERIOD-006 */
    public void reopen(YearMonth p, String reason) {
        if (reason == null || reason.isBlank() || closed.isEmpty() || !closed.last().equals(p)) {
            throw new PeriodException("cannot reopen " + p);
        }
        closed.remove(p);
        audit.append(actor, "REOPEN", p + ": " + reason);
    }
}
