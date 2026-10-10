package bpmn.timer;

public final class Durations {
    private Durations() {}

    /** @id CODE-TIMERS-002 @implements REQ-TIMERS-002 REQ-TIMERS-003 REQ-TIMERS-004 */
    public static long parse(String text) {
        try {
            return doParse(text);
        } catch (ArithmeticException e) {
            throw new IllegalArgumentException("duration overflow: " + text);
        }
    }

    private static long doParse(String s) {
        if (s == null || s.length() < 2 || s.charAt(0) != 'P') throw bad(s);
        long ms = 0;
        boolean inTime = false, any = false;
        int rank = 0, i = 1, n = s.length();
        while (i < n) {
            if (s.charAt(i) == 'T') {
                if (inTime || i == n - 1) throw bad(s);
                inTime = true;
                i++;
                continue;
            }
            int st = i;
            while (i < n && Character.isDigit(s.charAt(i))) i++;
            if (i == st || i == n) throw bad(s);
            long whole = Long.parseLong(s.substring(st, i));
            long frac = 0;
            boolean hasFrac = s.charAt(i) == '.';
            if (hasFrac) {
                int fs = ++i;
                while (i < n && Character.isDigit(s.charAt(i))) i++;
                int len = i - fs;
                if (len < 1 || len > 3 || i == n) throw bad(s);
                frac = Long.parseLong((s.substring(fs, i) + "00").substring(0, 3));
            }
            char u = s.charAt(i++);
            int r;
            long unit;
            switch (u) {
                case 'D' -> { r = 1; unit = 86_400_000L; if (inTime) throw bad(s); }
                case 'H' -> { r = 2; unit = 3_600_000L; if (!inTime) throw bad(s); }
                case 'M' -> { r = 3; unit = 60_000L; if (!inTime) throw bad(s); }
                case 'S' -> { r = 4; unit = 1_000L; if (!inTime) throw bad(s); }
                default -> throw bad(s);
            }
            if (r <= rank || (hasFrac && u != 'S')) throw bad(s);
            rank = r;
            ms = Math.addExact(ms, Math.addExact(Math.multiplyExact(whole, unit), frac));
            any = true;
        }
        if (!any) throw bad(s);
        return ms;
    }

    private static IllegalArgumentException bad(String s) { return new IllegalArgumentException("invalid duration: '" + s + "'"); }
}
