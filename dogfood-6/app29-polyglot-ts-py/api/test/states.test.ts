import { describe, it, expect } from "vitest";
import { STATES, TRANSITIONS, canTransition, isTerminal, reachable, shortestPath, UnknownStateError } from "../src/states";

describe("contract states", () => {
  /** @id TEST-CON-001 @verifies REQ-CON-001 */
  it("TEST-CON-001 exposes all states and targets are known", () => {
    expect(STATES.length).toBe(7);
    for (const [from, tos] of Object.entries(TRANSITIONS)) {
      expect(STATES).toContain(from);
      for (const t of tos) expect(STATES).toContain(t);
    }
  });

  /** @id TEST-CON-002 @verifies REQ-CON-002 */
  it("TEST-CON-002 allows listed transitions", () => {
    expect(canTransition("queued", "running")).toBe(true);
    expect(canTransition("failed", "retrying")).toBe(true);
  });

  /** @id TEST-CON-003 @verifies REQ-CON-003 */
  it("TEST-CON-003 rejects unlisted and self transitions", () => {
    expect(canTransition("succeeded", "running")).toBe(false);
    expect(canTransition("running", "running")).toBe(false);
    expect(canTransition("queued", "succeeded")).toBe(false);
  });

  /** @id TEST-CON-004 @verifies REQ-CON-004 */
  it("TEST-CON-004 throws on unknown state", () => {
    expect(() => canTransition("nope", "running")).toThrow(UnknownStateError);
    expect(() => canTransition("queued", "nope")).toThrow(UnknownStateError);
    expect(() => isTerminal("nope")).toThrow(UnknownStateError);
  });

  /** @id TEST-CON-005 @verifies REQ-CON-005 */
  it("TEST-CON-005 terminal states", () => {
    const terms = STATES.filter((s) => isTerminal(s)).sort();
    expect(terms).toEqual(["cancelled", "dead", "succeeded"]);
  });

  /** @id TEST-CON-006 @verifies REQ-CON-006 */
  it("TEST-CON-006 terminal states have no out-edges", () => {
    for (const s of STATES) if (isTerminal(s)) expect(TRANSITIONS[s]).toEqual([]);
  });

  /** @id TEST-CON-007 @verifies REQ-CON-007 */
  it("TEST-CON-007 reachable closure", () => {
    expect(reachable("queued")).toEqual(["cancelled", "dead", "failed", "retrying", "running", "succeeded"]);
    expect(reachable("failed")).toEqual(["cancelled", "dead", "failed", "retrying", "running", "succeeded"]);
    expect(reachable("dead")).toEqual([]);
  });

  /** @id TEST-CON-008 @verifies REQ-CON-008 */
  it("TEST-CON-008 shortest path", () => {
    expect(shortestPath("queued", "succeeded")).toEqual(["queued", "running", "succeeded"]);
    expect(shortestPath("queued", "queued")).toEqual(["queued"]);
    expect(shortestPath("dead", "queued")).toBeNull();
    expect(shortestPath("failed", "dead")).toEqual(["failed", "dead"]);
  });
});
