import limits from "../../contract/job.json";

export interface Job {
  type: string;
  payload: unknown;
  priority: number;
  maxAttempts: number;
  runAt: number;
  deadline: number | null;
  idempotencyKey: string | null;
}
export type ValidationResult = { ok: true; job: Job } | { ok: false; errors: string[] };

const TYPE_RE = new RegExp(limits.typePattern);
const KEY_RE = new RegExp(limits.idempotencyKeyPattern);
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

/** @id CODE-VAL-002 @implements REQ-VAL-008, REQ-VAL-011 */
function parseIso(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = ISO_RE.exec(s);
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1, 7).map(Number);
  const ms = m[7] ? Number(m[7].padEnd(3, "0")) : 0;
  const dt = new Date(0);
  dt.setUTCFullYear(y, mo - 1, d);
  dt.setUTCHours(h, mi, se, ms);
  const t = dt.getTime();
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || dt.getUTCHours() !== h || mi > 59 || se > 59) return null;
  return t;
}

function isIntIn(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

/** @id CODE-VAL-001 @implements REQ-VAL-001, REQ-VAL-002, REQ-VAL-003, REQ-VAL-004, REQ-VAL-005, REQ-VAL-006, REQ-VAL-007, REQ-VAL-008, REQ-VAL-009, REQ-VAL-010 */
export function validateJob(input: unknown, now: number): ValidationResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return { ok: false, errors: ["not_object"] };
  const o = input as Record<string, unknown>;
  const errors = new Set<string>();
  for (const k of Object.keys(o)) if (!limits.allowedFields.includes(k)) errors.add(`unknown_field:${k}`);

  if (typeof o.type !== "string" || !TYPE_RE.test(o.type)) errors.add("invalid_type");

  const pr = limits.priority;
  const priority = o.priority === undefined ? pr.default : o.priority;
  if (!isIntIn(priority, pr.min, pr.max)) errors.add("invalid_priority");
  const ma = limits.maxAttempts;
  const maxAttempts = o.maxAttempts === undefined ? ma.default : o.maxAttempts;
  if (!isIntIn(maxAttempts, ma.min, ma.max)) errors.add("invalid_max_attempts");

  let payload: unknown = null;
  if (o.payload !== undefined) {
    payload = o.payload;
    try {
      const json = JSON.stringify(payload);
      if (json === undefined) errors.add("payload_not_json");
      else if (new TextEncoder().encode(json).length > limits.maxPayloadBytes) errors.add("payload_too_large");
    } catch {
      errors.add("payload_not_json");
    }
  }

  let runAt = now;
  if (o.runAt !== undefined) {
    const t = parseIso(o.runAt);
    if (t === null) errors.add("invalid_run_at");
    else runAt = t;
  }
  let deadline: number | null = null;
  if (o.deadline !== undefined) {
    const t = parseIso(o.deadline);
    if (t === null) errors.add("invalid_deadline");
    else {
      deadline = t;
      if (!errors.has("invalid_run_at") && t <= runAt) errors.add("deadline_before_run");
    }
  }

  let idempotencyKey: string | null = null;
  if (o.idempotencyKey !== undefined) {
    if (typeof o.idempotencyKey !== "string" || !KEY_RE.test(o.idempotencyKey)) errors.add("invalid_idempotency_key");
    else idempotencyKey = o.idempotencyKey;
  }

  if (errors.size) return { ok: false, errors: [...errors].sort() };
  return { ok: true, job: { type: o.type as string, payload, priority: priority as number, maxAttempts: maxAttempts as number, runAt, deadline, idempotencyKey } };
}
