package bpmn.timer;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class TimerQueue {
    public record Entry(String id, long due, long seq) {}

    private final List<Entry> heap = new ArrayList<>();
    private final Map<String, Integer> index = new HashMap<>();
    private long nextSeq;

    /** @id CODE-TIMERS-003 @implements REQ-TIMERS-005 REQ-TIMERS-006 REQ-TIMERS-008 */
    public void schedule(String id, long due) {
        if (index.containsKey(id)) throw new IllegalArgumentException("timer already scheduled: " + id);
        heap.add(new Entry(id, due, nextSeq++));
        index.put(id, heap.size() - 1);
        up(heap.size() - 1);
    }

    public boolean cancel(String id) {
        Integer at = index.get(id);
        if (at == null) return false;
        removeAt(at);
        return true;
    }

    /** @id CODE-TIMERS-004 @implements REQ-TIMERS-007 */
    public List<Entry> pollDue(long now) {
        List<Entry> out = new ArrayList<>();
        while (!heap.isEmpty() && heap.get(0).due() <= now) {
            out.add(heap.get(0));
            removeAt(0);
        }
        return out;
    }

    public Long nextDue() { return heap.isEmpty() ? null : heap.get(0).due(); }

    public int size() { return heap.size(); }

    private void removeAt(int at) {
        Entry gone = heap.get(at);
        int last = heap.size() - 1;
        index.remove(gone.id());
        Entry moved = heap.remove(last);
        if (at == last) return;
        heap.set(at, moved);
        index.put(moved.id(), at);
        down(at);
        up(at);
    }

    private boolean less(int a, int b) {
        Entry x = heap.get(a), y = heap.get(b);
        return x.due() != y.due() ? x.due() < y.due() : x.seq() < y.seq();
    }

    private void swap(int a, int b) {
        Entry x = heap.get(a), y = heap.get(b);
        heap.set(a, y);
        heap.set(b, x);
        index.put(y.id(), a);
        index.put(x.id(), b);
    }

    private void up(int k) {
        while (k > 0 && less(k, (k - 1) / 2)) { swap(k, (k - 1) / 2); k = (k - 1) / 2; }
    }

    private void down(int k) {
        int n = heap.size();
        while (true) {
            int l = 2 * k + 1, r = l + 1, m = k;
            if (l < n && less(l, m)) m = l;
            if (r < n && less(r, m)) m = r;
            if (m == k) return;
            swap(k, m);
            k = m;
        }
    }
}
