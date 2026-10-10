package bpmn.timer;

/** @id CODE-TIMERS-001 @implements REQ-TIMERS-001 REQ-TIMERS-014 */
public class ManualClock implements Clock {
    private long now;

    public ManualClock(long start) { this.now = start; }

    public long nowMillis() { return now; }

    public void advance(long ms) {
        if (ms < 0) throw new IllegalArgumentException("negative advance: " + ms);
        if (ms > Long.MAX_VALUE - now) throw new IllegalArgumentException("clock overflow: " + now + " + " + ms);
        now += ms;
    }

    public void set(long ms) {
        if (ms < now) throw new IllegalArgumentException("clock cannot go backwards: " + ms + " < " + now);
        now = ms;
    }
}
