package ledger.journal;

import java.time.LocalDate;
import java.util.List;

public record JournalEntry(long id, LocalDate date, String memo, List<Line> lines, Long reversalOf) {
    /** @id CODE-JRNL-011 @implements REQ-JRNL-011 */
    public JournalEntry {
        lines = List.copyOf(lines);
    }
}
