import { describe, it, expect } from "vitest";
import { JobQueue, QueueFullError, IllegalTransitionError, ValidationError } from "../src/queue";

const T0 = Date.parse("2024-03-01T00:00:00.000Z");
const mk = (o: Record<string, unknown> = {}) => ({ type: "t.x", ...o });

describe("queue", () => {
  /** @id TEST-QUE-001 @verifies REQ-QUE-001 */
  it("TEST-QUE-001 enqueue valid / invalid", () => {
    const q = new JobQueue({ capacity: 10, leaseMs: 1000 });
    const r = q.enqueue(mk(), T0);
    expect(r).toEqual({ id: r.id, deduplicated: false });
    expect(q.get(r.id)?.state).toBe("queued");
    expect(q.get(r.id)?.attempts).toBe(0);
    try {
      q.enqueue({ type: "BAD" }, T0);
      throw new Error("should not reach");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).errors).toEqual(["invalid_type"]);
    }
  });

  /** @id TEST-QUE-002 @verifies REQ-QUE-002 */
  it("TEST-QUE-002 priority then FIFO", () => {
    const q = new JobQueue({ capacity: 10, leaseMs: 1000 });
    const a = q.enqueue(mk({ priority: 1 }), T0).id;
    const b = q.enqueue(mk({ priority: 9 }), T0).id;
    const c = q.enqueue(mk({ priority: 9 }), T0).id;
    const d = q.enqueue(mk({ priority: 5 }), T0).id;
    const order = [q.dequeue(T0), q.dequeue(T0), q.dequeue(T0), q.dequeue(T0), q.dequeue(T0)].map((j) => j?.id ?? null);
    expect(order).toEqual([b, c, d, a, null]);
  });

  /** @id TEST-QUE-003 @verifies REQ-QUE-003 */
  it("TEST-QUE-003 delayed jobs hidden until runAt", () => {
    const q = new JobQueue({ capacity: 10, leaseMs: 1000 });
    const later = q.enqueue(mk({ priority: 9, runAt: "2024-03-01T00:00:10Z" }), T0).id;
    const now = q.enqueue(mk({ priority: 1 }), T0).id;
    expect(q.dequeue(T0)?.id).toBe(now);
    expect(q.dequeue(T0 + 9999)).toBeNull();
    expect(q.dequeue(T0 + 10000)?.id).toBe(later);
  });

  /** @id TEST-QUE-004 @verifies REQ-QUE-004 */
  it("TEST-QUE-004 idempotency key dedupes", () => {
    const q = new JobQueue({ capacity: 1, leaseMs: 1000 });
    const a = q.enqueue(mk({ idempotencyKey: "k1" }), T0);
    const b = q.enqueue(mk({ idempotencyKey: "k1", priority: 9 }), T0);
    expect(b).toEqual({ id: a.id, deduplicated: true });
    expect(q.stats().total).toBe(1);
    expect(q.get(a.id)?.job.priority).toBe(5);
  });

  /** @id TEST-QUE-005 @verifies REQ-QUE-005 */
  it("TEST-QUE-005 capacity counts non-terminal jobs", () => {
    const q = new JobQueue({ capacity: 2, leaseMs: 1000 });
    const a = q.enqueue(mk(), T0).id;
    q.enqueue(mk(), T0);
    expect(() => q.enqueue(mk(), T0)).toThrow(QueueFullError);
    q.cancel(a);
    expect(() => q.enqueue(mk(), T0)).not.toThrow();
  });

  /** @id TEST-QUE-006 @verifies REQ-QUE-006 */
  it("TEST-QUE-006 dequeue leases", () => {
    const q = new JobQueue({ capacity: 10, leaseMs: 500 });
    const id = q.enqueue(mk(), T0).id;
    const j = q.dequeue(T0 + 7)!;
    expect(j.id).toBe(id);
    expect(j.state).toBe("running");
    expect(j.attempts).toBe(1);
    expect(j.leaseUntil).toBe(T0 + 507);
  });

  /** @id TEST-QUE-007 @verifies REQ-QUE-007 */
  it("TEST-QUE-007 reclaim expired leases", () => {
    const q = new JobQueue({ capacity: 10, leaseMs: 100 });
    const a = q.enqueue(mk({ maxAttempts: 2 }), T0).id;
    q.dequeue(T0);
    expect(q.reclaimExpired(T0 + 99)).toEqual([]);
    expect(q.reclaimExpired(T0 + 100)).toEqual([a]);
    expect(q.get(a)?.state).toBe("retrying");
    expect(q.get(a)?.leaseUntil).toBeNull();
    expect(q.dequeue(T0 + 100)?.attempts).toBe(2);
    q.reclaimExpired(T0 + 300);
    expect(q.get(a)?.state).toBe("dead");
    expect(q.dequeue(T0 + 1000)).toBeNull();
  });

  /** @id TEST-QUE-008 @verifies REQ-QUE-008 */
  it("TEST-QUE-008 ack", () => {
    const q = new JobQueue({ capacity: 10, leaseMs: 100 });
    const id = q.enqueue(mk(), T0).id;
    expect(() => q.ack(id)).toThrow(IllegalTransitionError);
    q.dequeue(T0);
    q.ack(id);
    expect(q.get(id)?.state).toBe("succeeded");
    expect(q.get(id)?.leaseUntil).toBeNull();
    expect(() => q.ack(id)).toThrow(IllegalTransitionError);
    expect(() => q.ack("nope")).toThrow(IllegalTransitionError);
  });

  /** @id TEST-QUE-009 @verifies REQ-QUE-009 */
  it("TEST-QUE-009 cancel", () => {
    const q = new JobQueue({ capacity: 10, leaseMs: 100 });
    const a = q.enqueue(mk(), T0).id;
    q.cancel(a);
    expect(q.get(a)?.state).toBe("cancelled");
    expect(() => q.cancel(a)).toThrow(IllegalTransitionError);
    const b = q.enqueue(mk(), T0).id;
    q.dequeue(T0);
    q.cancel(b);
    expect(q.get(b)?.state).toBe("cancelled");
    expect(q.get(b)?.leaseUntil).toBeNull();
    expect(q.dequeue(T0)).toBeNull();
  });

  /** @id TEST-QUE-010 @verifies REQ-QUE-010 */
  it("TEST-QUE-010 nack with delay or dead", () => {
    const q = new JobQueue({ capacity: 10, leaseMs: 100 });
    const id = q.enqueue(mk({ maxAttempts: 2 }), T0).id;
    q.dequeue(T0);
    q.nack(id, T0 + 5000);
    expect(q.get(id)?.state).toBe("retrying");
    expect(q.dequeue(T0 + 4999)).toBeNull();
    expect(q.dequeue(T0 + 5000)?.attempts).toBe(2);
    q.nack(id, T0 + 6000);
    expect(q.get(id)?.state).toBe("dead");
    expect(() => q.nack(id, T0)).toThrow(IllegalTransitionError);
  });

  /** @id TEST-QUE-011 @verifies REQ-QUE-011 */
  it("TEST-QUE-011 stats sum", () => {
    const q = new JobQueue({ capacity: 10, leaseMs: 100 });
    const a = q.enqueue(mk(), T0).id;
    q.enqueue(mk(), T0);
    q.enqueue(mk(), T0);
    q.dequeue(T0);
    q.ack(a);
    const s = q.stats();
    expect(s.total).toBe(3);
    expect(s.byState.succeeded).toBe(1);
    expect(s.byState.queued).toBe(2);
    expect(Object.values(s.byState).reduce((x, y) => x + y, 0)).toBe(s.total);
    expect(Object.keys(s.byState).sort()).toEqual(["cancelled", "dead", "failed", "queued", "retrying", "running", "succeeded"]);
  });

  /** @id TEST-QUE-012 @verifies REQ-QUE-012 */
  it("TEST-QUE-012 deadline passed is cancelled on dequeue", () => {
    const q = new JobQueue({ capacity: 10, leaseMs: 100 });
    const late = q.enqueue(mk({ priority: 9, deadline: "2024-03-01T00:00:05Z" }), T0).id;
    const ok = q.enqueue(mk({ priority: 1 }), T0).id;
    expect(q.dequeue(T0 + 5000)?.id).toBe(ok);
    expect(q.get(late)?.state).toBe("cancelled");
  });
});
