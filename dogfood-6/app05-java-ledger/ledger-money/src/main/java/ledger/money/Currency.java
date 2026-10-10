package ledger.money;

import java.util.Map;

public final class Currency {
    private static final Map<String, Integer> DIGITS = Map.of("USD", 2, "EUR", 2, "GBP", 2, "JPY", 0, "KWD", 3);
    private final String code;
    private final int digits;

    private Currency(String code, int digits) {
        this.code = code;
        this.digits = digits;
    }

    /** @id CODE-MONEY-001 @implements REQ-MONEY-001 */
    public static Currency of(String code) {
        Integer d = code == null ? null : DIGITS.get(code);
        if (d == null) {
            throw new IllegalArgumentException("unknown currency: " + code);
        }
        return new Currency(code, d);
    }

    public int digits() { return digits; }
    public String code() { return code; }

    @Override public boolean equals(Object o) { return o instanceof Currency c && c.code.equals(code); }
    @Override public int hashCode() { return code.hashCode(); }
    @Override public String toString() { return code; }
}
