import { validateRetry } from '@app008/definitions';
import type { RetryPolicy } from '@app008/definitions';
import { validTime } from '@app008/timers';
export class PermanentError extends Error {}
/** @id CODE-SAGA-001 @implements REQ-SAGA-001 REQ-SAGA-002 REQ-SAGA-003 */
export function backoff(attempt: number, base: number, cap: number): number {
  validateRetry({ maxAttempts: attempt, base, cap });
  if (base === 0) return 0;
  if (attempt > 53) return cap;
  const multiplier = 2 ** (attempt - 1);
  return base >= cap / multiplier ? cap : base * multiplier;
}
/** @id CODE-SAGA-002 @implements REQ-SAGA-004 REQ-SAGA-005 REQ-SAGA-006 REQ-SAGA-010 */
export function retryDecision(policy: RetryPolicy, attempt: number, now: number, error: unknown): number | null {
  validateRetry(policy); validTime(now);
  const delay = backoff(attempt, policy.base, policy.cap);
  if (error instanceof PermanentError || attempt >= policy.maxAttempts) return null;
  const deadline = now + delay; validTime(deadline); return deadline;
}
export interface Success { step: string; compensation?: string; output: unknown }
export interface Compensation extends Success { compensation: string; effectKey: string }
/** @id CODE-SAGA-003 @implements REQ-SAGA-007 REQ-SAGA-008 REQ-SAGA-009 */
export function compensations(runId: string, successful: Success[], completed: string[]): Compensation[] {
  const done = new Set(completed);
  return successful.slice().reverse().filter(s => s.compensation && !done.has(s.step)).map(s => ({
    step: s.step, compensation: s.compensation!, output: structuredClone(s.output),
    effectKey: `${encodeURIComponent(runId)}:compensate:${encodeURIComponent(s.step)}`
  }));
}
