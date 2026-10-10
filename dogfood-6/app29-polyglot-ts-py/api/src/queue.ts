import { canTransition, isTerminal, STATES } from "./states";
import { validateJob, type Job } from "./validate";

export class QueueFullError extends Error {
  constructor() {
    super("queue full");
    this.name = "QueueFullError";
  }
}
export class IllegalTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`illegal transition ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}
export class ValidationError extends Error {
  constructor(public errors: string[]) {
    super(`invalid job: ${errors.join(",")}`);
    this.name = "ValidationError";
  }
}

export interface JobRecord {
  id: string;
  job: Job;
  state: string;
  attempts: number;
  seq: number;
  visibleAt: number;
  leaseUntil: number | null;
}

/** @id CODE-QUE-001 @implements REQ-QUE-001, REQ-QUE-004, REQ-QUE-005 */
export class JobQueue {
  private jobs = new Map<string, JobRecord>();
  private byKey = new Map<string, string>();
  private seq = 0;

  constructor(private opts: { capacity: number; leaseMs: number }) {}

  enqueue(input: unknown, now: number): { id: string; deduplicated: boolean } {
    const v = validateJob(input, now);
    if (!v.ok) throw new ValidationError(v.errors);
    const key = v.job.idempotencyKey;
    if (key !== null && this.byKey.has(key)) return { id: this.byKey.get(key)!, deduplicated: true };
    if (this.liveCount() >= this.opts.capacity) throw new QueueFullError();
    const id = `j${++this.seq}`;
    this.jobs.set(id, { id, job: v.job, state: "queued", attempts: 0, seq: this.seq, visibleAt: v.job.runAt, leaseUntil: null });
    if (key !== null) this.byKey.set(key, id);
    return { id, deduplicated: false };
  }

  get(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }

  private liveCount(): number {
    return [...this.jobs.values()].filter((r) => !isTerminal(r.state)).length;
  }

  private move(r: JobRecord, to: string): void {
    if (!canTransition(r.state, to)) throw new IllegalTransitionError(r.state, to);
    r.state = to;
    if (to !== "running") r.leaseUntil = null;
  }

  private lookup(id: string, to: string): JobRecord {
    const r = this.jobs.get(id);
    if (!r) throw new IllegalTransitionError("missing", to);
    return r;
  }

  /** @id CODE-QUE-002 @implements REQ-QUE-002, REQ-QUE-003, REQ-QUE-006, REQ-QUE-012 */
  dequeue(now: number): JobRecord | null {
    const ready = [...this.jobs.values()]
      .filter((r) => (r.state === "queued" || r.state === "retrying") && r.visibleAt <= now)
      .sort((a, b) => b.job.priority - a.job.priority || a.seq - b.seq);
    for (const r of ready) {
      if (r.job.deadline !== null && r.job.deadline <= now) {
        this.move(r, "cancelled");
        continue;
      }
      this.move(r, "running");
      r.attempts++;
      r.leaseUntil = now + this.opts.leaseMs;
      return r;
    }
    return null;
  }

  private fail(r: JobRecord, retryAt: number): void {
    this.move(r, "failed");
    if (r.attempts >= r.job.maxAttempts) this.move(r, "dead");
    else {
      this.move(r, "retrying");
      r.visibleAt = retryAt;
    }
  }

  /** @id CODE-QUE-003 @implements REQ-QUE-007, REQ-QUE-010 */
  reclaimExpired(now: number): string[] {
    const out: string[] = [];
    for (const r of this.jobs.values()) {
      if (r.state === "running" && r.leaseUntil !== null && r.leaseUntil <= now) {
        this.fail(r, now);
        out.push(r.id);
      }
    }
    return out;
  }

  nack(id: string, retryAt: number): void {
    const r = this.lookup(id, "failed");
    if (r.state !== "running") throw new IllegalTransitionError(r.state, "failed");
    this.fail(r, retryAt);
  }

  /** @id CODE-QUE-004 @implements REQ-QUE-008, REQ-QUE-009 */
  ack(id: string): void {
    this.move(this.lookup(id, "succeeded"), "succeeded");
  }

  cancel(id: string): void {
    this.move(this.lookup(id, "cancelled"), "cancelled");
  }

  /** @id CODE-QUE-005 @implements REQ-QUE-011 */
  stats(): { total: number; byState: Record<string, number> } {
    const byState: Record<string, number> = Object.fromEntries(STATES.map((s) => [s, 0]));
    for (const r of this.jobs.values()) byState[r.state]++;
    return { total: this.jobs.size, byState };
  }
}
