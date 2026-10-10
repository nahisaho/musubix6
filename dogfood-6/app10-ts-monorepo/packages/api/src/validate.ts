import { money, type Money } from '@bk/domain';
import { zonedOffsetMinutes, type Interval } from '@bk/scheduling';

export interface CreateRequest { resource: string; timeZone: string; interval: Interval; price: Money }
export interface FieldError { field: string; message: string }
export type ValidationResult = { ok: true; value: CreateRequest } | { ok: false; errors: FieldError[] };

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function parseIso(v: unknown): number | undefined {
  if (typeof v !== 'string') return undefined;
  const m = ISO.exec(v);
  if (!m) return undefined;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return undefined;
  if (+m[4] > 23 || +m[5] > 59 || +(m[6] ?? 0) > 59) return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : t;
}

/** @id CODE-VALIDATE-001 @implements REQ-VALIDATE-001 REQ-VALIDATE-002 REQ-VALIDATE-003 REQ-VALIDATE-004 REQ-VALIDATE-005 REQ-VALIDATE-006 REQ-VALIDATE-007 */
export function validateCreateRequest(body: unknown): ValidationResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, errors: [{ field: 'body', message: 'must be an object' }] };
  }
  const b = body as Record<string, unknown>;
  const errors: FieldError[] = [];
  const err = (field: string, message: string) => errors.push({ field, message });

  const resource = b.resource;
  if (typeof resource !== 'string' || resource.length === 0 || resource.length > 64) err('resource', 'must be 1-64 chars');

  const start = parseIso(b.start);
  const end = parseIso(b.end);
  if (start === undefined) err('start', 'must be ISO-8601 with offset');
  if (end === undefined) err('end', 'must be ISO-8601 with offset');
  else if (start !== undefined && end <= start) err('end', 'must be after start');

  let tz = b.timeZone;
  try {
    if (typeof tz !== 'string') throw new RangeError('not a string');
    zonedOffsetMinutes(tz, 0);
  } catch {
    err('timeZone', 'must be a valid IANA zone');
    tz = undefined;
  }

  let price: Money | undefined;
  try {
    if (typeof b.priceCents !== 'number' || b.priceCents < 0 || typeof b.currency !== 'string') throw new RangeError('bad price');
    price = money(b.priceCents, b.currency);
  } catch {
    err('price', 'priceCents must be a non-negative integer and currency 3 uppercase letters');
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { resource: resource as string, timeZone: tz as string, interval: { start: start!, end: end! }, price: price! },
  };
}
