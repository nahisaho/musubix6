import { describe, it, expect } from "vitest";
import { validateJob } from "../src/validate";

const NOW = Date.parse("2024-03-01T00:00:00.000Z");
const ok = { type: "email.send" };

describe("validate", () => {
  /** @id TEST-VAL-001 @verifies REQ-VAL-001 */
  it("TEST-VAL-001 valid job gets defaults", () => {
    const r = validateJob(ok, NOW);
    expect(r).toEqual({
      ok: true,
      job: { type: "email.send", payload: null, priority: 5, maxAttempts: 3, runAt: NOW, deadline: null, idempotencyKey: null },
    });
  });

  /** @id TEST-VAL-002 @verifies REQ-VAL-002 */
  it("TEST-VAL-002 non-object rejected", () => {
    for (const bad of [null, [], 5, "x", undefined]) {
      expect(validateJob(bad, NOW)).toEqual({ ok: false, errors: ["not_object"] });
    }
  });

  /** @id TEST-VAL-003 @verifies REQ-VAL-003 */
  it("TEST-VAL-003 unknown field", () => {
    const r = validateJob({ ...ok, foo: 1 }, NOW);
    expect(r).toEqual({ ok: false, errors: ["unknown_field:foo"] });
  });

  /** @id TEST-VAL-004 @verifies REQ-VAL-004 */
  it("TEST-VAL-004 type pattern", () => {
    for (const t of [undefined, "", "Email", "a..b", "1a", "a.", 5]) {
      const r = validateJob({ type: t }, NOW);
      expect(r).toEqual({ ok: false, errors: ["invalid_type"] });
    }
    expect(validateJob({ type: "a" }, NOW).ok).toBe(true);
  });

  /** @id TEST-VAL-005 @verifies REQ-VAL-005 */
  it("TEST-VAL-005 priority range", () => {
    for (const p of [-1, 10, 2.5, NaN, "5", null, Infinity]) {
      expect(validateJob({ ...ok, priority: p }, NOW)).toEqual({ ok: false, errors: ["invalid_priority"] });
    }
    expect(validateJob({ ...ok, priority: 0 }, NOW).ok).toBe(true);
    expect(validateJob({ ...ok, priority: 9 }, NOW).ok).toBe(true);
  });

  /** @id TEST-VAL-006 @verifies REQ-VAL-006 */
  it("TEST-VAL-006 maxAttempts range", () => {
    for (const p of [0, 11, 1.5, "3"]) {
      expect(validateJob({ ...ok, maxAttempts: p }, NOW)).toEqual({ ok: false, errors: ["invalid_max_attempts"] });
    }
    expect(validateJob({ ...ok, maxAttempts: 10 }, NOW).ok).toBe(true);
  });

  /** @id TEST-VAL-007 @verifies REQ-VAL-007 */
  it("TEST-VAL-007 payload size in UTF-8 bytes", () => {
    const fits = { s: "a".repeat(1024 - 8) }; // {"s":"..."} = 8 overhead
    expect(validateJob({ ...ok, payload: fits }, NOW).ok).toBe(true);
    expect(validateJob({ ...ok, payload: { s: "a".repeat(1024 - 7) } }, NOW)).toEqual({ ok: false, errors: ["payload_too_large"] });
    // 3-byte chars: 400 chars = 1200 bytes > limit although < 1024 chars
    expect(validateJob({ ...ok, payload: { s: "あ".repeat(400) } }, NOW)).toEqual({ ok: false, errors: ["payload_too_large"] });
    const cyc: any = {};
    cyc.self = cyc;
    expect(validateJob({ ...ok, payload: cyc }, NOW)).toEqual({ ok: false, errors: ["payload_not_json"] });
    expect(validateJob({ ...ok, payload: 10n }, NOW)).toEqual({ ok: false, errors: ["payload_not_json"] });
  });

  /** @id TEST-VAL-008 @verifies REQ-VAL-008 */
  it("TEST-VAL-008 dates strict", () => {
    const r = validateJob({ ...ok, runAt: "2024-03-02T10:00:00Z", deadline: "2024-03-02T10:00:01.500Z" }, NOW);
    expect(r.ok && r.job.runAt).toBe(Date.parse("2024-03-02T10:00:00Z"));
    expect(validateJob({ ...ok, runAt: "2024-02-30T00:00:00Z" }, NOW)).toEqual({ ok: false, errors: ["invalid_run_at"] });
    expect(validateJob({ ...ok, runAt: "2024-03-02" }, NOW)).toEqual({ ok: false, errors: ["invalid_run_at"] });
    expect(validateJob({ ...ok, runAt: "2024-03-02T10:00:00+09:00" }, NOW)).toEqual({ ok: false, errors: ["invalid_run_at"] });
    expect(validateJob({ ...ok, deadline: "garbage" }, NOW)).toEqual({ ok: false, errors: ["invalid_deadline"] });
    expect(validateJob({ ...ok, runAt: "2024-03-02T10:00:00Z", deadline: "2024-03-02T10:00:00Z" }, NOW)).toEqual({ ok: false, errors: ["deadline_before_run"] });
    // deadline compared with default runAt (now)
    expect(validateJob({ ...ok, deadline: "2024-02-29T00:00:00Z" }, NOW)).toEqual({ ok: false, errors: ["deadline_before_run"] });
    expect(validateJob({ ...ok, runAt: "2024-02-29T00:00:00Z" }, NOW).ok).toBe(true);
  });

  /** @id TEST-VAL-009 @verifies REQ-VAL-009 */
  it("TEST-VAL-009 idempotency key", () => {
    for (const k of ["", "a b", "x".repeat(65), 5, "é"]) {
      expect(validateJob({ ...ok, idempotencyKey: k }, NOW)).toEqual({ ok: false, errors: ["invalid_idempotency_key"] });
    }
    const r = validateJob({ ...ok, idempotencyKey: "abc_DEF-1" }, NOW);
    expect(r.ok && r.job.idempotencyKey).toBe("abc_DEF-1");
  });

  /** @id TEST-VAL-010 @verifies REQ-VAL-010 */
  it("TEST-VAL-010 collects all errors sorted unique", () => {
    const r = validateJob({ type: "X", priority: 99, maxAttempts: 0, zzz: 1, aaa: 2 }, NOW);
    expect(r).toEqual({
      ok: false,
      errors: ["invalid_max_attempts", "invalid_priority", "invalid_type", "unknown_field:aaa", "unknown_field:zzz"],
    });
    const input = { type: "x", priority: 3 };
    const copy = JSON.stringify(input);
    validateJob(input, NOW);
    expect(JSON.stringify(input)).toBe(copy);
  });

  /** @id TEST-VAL-011 @verifies REQ-VAL-011 */
  it("TEST-VAL-011 years below 100 are literal", () => {
    const r = validateJob({ ...ok, runAt: "0050-01-01T00:00:00Z" }, NOW);
    expect(r.ok && new Date(r.job.runAt).getUTCFullYear()).toBe(50);
    expect(validateJob({ ...ok, runAt: "0000-02-29T00:00:00Z" }, NOW).ok).toBe(true);
    expect(validateJob({ ...ok, runAt: "0001-02-29T00:00:00Z" }, NOW)).toEqual({ ok: false, errors: ["invalid_run_at"] });
  });
});
