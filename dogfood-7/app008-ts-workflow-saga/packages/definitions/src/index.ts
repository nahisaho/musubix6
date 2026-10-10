import { createHash } from 'node:crypto';
import { canonical, jsonCopy, identifier } from '@app008/history';
export interface RetryPolicy { maxAttempts: number; base: number; cap: number }
export type Step =
  | { id: string; kind: 'activity'; activity: string; compensation?: string; retry: RetryPolicy }
  | { id: string; kind: 'timer'; duration: number }
  | { id: string; kind: 'signal'; signal: string };
export interface Definition { name: string; version: number; steps: Step[] }

/** @id CODE-DEFINITIONS-002 @implements REQ-DEFINITIONS-009 REQ-DEFINITIONS-010 */
export function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
export function validateRetry(policy: RetryPolicy): void {
  if (!policy || !Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1 ||
    !Number.isSafeInteger(policy.base) || policy.base < 0 || !Number.isSafeInteger(policy.cap) || policy.cap < policy.base) {
    throw new TypeError('invalid retry policy');
  }
}
export function validateDefinition(input: Definition): Definition {
  const d = jsonCopy(input);
  if (!d || typeof d !== 'object') throw new TypeError('invalid definition');
  identifier(d.name);
  if (!Number.isSafeInteger(d.version) || d.version < 1 || !Array.isArray(d.steps) || d.steps.length > 10000) {
    throw new TypeError('invalid definition version or steps');
  }
  const ids = new Set<string>();
  for (const s of d.steps) {
    if (!s || typeof s !== 'object') throw new TypeError('invalid step');
    identifier(s.id);
    if (ids.has(s.id)) throw new TypeError('duplicate step identifier');
    ids.add(s.id);
    switch (s.kind) {
      case 'activity':
        identifier(s.activity);
        if (s.compensation !== undefined) identifier(s.compensation);
        validateRetry(s.retry); break;
      case 'timer':
        if (!Number.isSafeInteger(s.duration) || s.duration < 0) throw new TypeError('invalid timer duration');
        break;
      case 'signal': identifier(s.signal); break;
      default: throw new TypeError('invalid command kind');
    }
  }
  return d;
}
/** @id CODE-DEFINITIONS-001 @implements REQ-DEFINITIONS-001 REQ-DEFINITIONS-002 REQ-DEFINITIONS-003 REQ-DEFINITIONS-004 REQ-DEFINITIONS-005 REQ-DEFINITIONS-006 REQ-DEFINITIONS-007 REQ-DEFINITIONS-008 */
export class Registry {
  private definitions = new Map<string, Map<number, Definition>>();
  register(input: Definition): void {
    const d = validateDefinition(input);
    const versions = this.definitions.get(d.name) ?? new Map<number, Definition>();
    if (versions.has(d.version)) throw new Error('definition version exists');
    versions.set(d.version, d); this.definitions.set(d.name, versions);
  }
  get(name: string, version?: number): Definition {
    identifier(name);
    const versions = this.definitions.get(name);
    if (!versions) throw new Error('unknown workflow');
    const requested = version ?? [...versions.keys()].reduce((max, v) => Math.max(max, v), 0);
    const d = versions.get(requested);
    if (!d) throw new Error('unknown workflow version');
    return jsonCopy(d);
  }
}
