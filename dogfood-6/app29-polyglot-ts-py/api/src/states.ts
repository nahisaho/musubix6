import table from "../../contract/states.json";

type Table = { states: string[]; terminal: string[]; transitions: Record<string, string[]> };
const T = table as Table;

/** @id CODE-CON-001 @implements REQ-CON-001 */
export const STATES: readonly string[] = T.states;
export const TRANSITIONS: Readonly<Record<string, readonly string[]>> = T.transitions;

export class UnknownStateError extends Error {
  constructor(state: string) {
    super(`unknown state: ${state}`);
    this.name = "UnknownStateError";
  }
}

function assertKnown(s: string): void {
  if (!Object.prototype.hasOwnProperty.call(TRANSITIONS, s)) throw new UnknownStateError(s);
}

/** @id CODE-CON-002 @implements REQ-CON-002, REQ-CON-003, REQ-CON-004 */
export function canTransition(from: string, to: string): boolean {
  assertKnown(from);
  assertKnown(to);
  return TRANSITIONS[from].includes(to);
}

/** @id CODE-CON-003 @implements REQ-CON-005, REQ-CON-006 */
export function isTerminal(s: string): boolean {
  assertKnown(s);
  return T.terminal.includes(s);
}

/** @id CODE-CON-004 @implements REQ-CON-007 */
export function reachable(from: string): string[] {
  assertKnown(from);
  const seen = new Set<string>();
  const stack = [...TRANSITIONS[from]];
  while (stack.length) {
    const s = stack.pop()!;
    if (seen.has(s)) continue;
    seen.add(s);
    stack.push(...TRANSITIONS[s]);
  }
  return [...seen].sort();
}

/** @id CODE-CON-005 @implements REQ-CON-008 */
export function shortestPath(from: string, to: string): string[] | null {
  assertKnown(from);
  assertKnown(to);
  if (from === to) return [from];
  const prev = new Map<string, string>([[from, ""]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of TRANSITIONS[cur]) {
      if (prev.has(n)) continue;
      prev.set(n, cur);
      if (n === to) {
        const path = [n];
        let p = cur;
        while (p) {
          path.unshift(p);
          p = prev.get(p)!;
        }
        return path;
      }
      queue.push(n);
    }
  }
  return null;
}
