import { describe, it, expect } from 'vitest';
import { validateCreateRequest } from '../src/validate';

const good = {
  resource: 'room-1', start: '2024-01-15T09:00:00+09:00', end: '2024-01-15T10:00:00+09:00',
  timeZone: 'Asia/Tokyo', priceCents: 5000, currency: 'JPY',
};
const fields = (b: unknown) => {
  const r = validateCreateRequest(b);
  return r.ok ? [] : r.errors.map((e) => e.field);
};

describe('validateCreateRequest', () => {
  /** @id TEST-VALIDATE-001 @verifies REQ-VALIDATE-001 */
  it('TEST-VALIDATE-001 body must be object', () => {
    for (const b of [null, undefined, 5, 'x', [], [good]]) expect(fields(b)).toEqual(['body']);
  });
  /** @id TEST-VALIDATE-002 @verifies REQ-VALIDATE-002 */
  it('TEST-VALIDATE-002 resource', () => {
    expect(fields({ ...good, resource: '' })).toEqual(['resource']);
    expect(fields({ ...good, resource: 7 })).toEqual(['resource']);
    expect(fields({ ...good, resource: 'x'.repeat(65) })).toEqual(['resource']);
    expect(fields({ ...good, resource: 'x'.repeat(64) })).toEqual([]);
  });
  /** @id TEST-VALIDATE-003 @verifies REQ-VALIDATE-003 */
  it('TEST-VALIDATE-003 timestamps need explicit offset', () => {
    expect(fields({ ...good, start: '2024-01-15T09:00:00' })).toEqual(['start']);
    expect(fields({ ...good, end: 'January 15 2024' })).toEqual(['end']);
    expect(fields({ ...good, start: 12345 })).toEqual(['start']);
    expect(fields({ ...good, start: '2024-02-30T09:00:00Z' })).toEqual(['start']);
    expect(fields({ ...good, start: '2024-01-15T09:00:00Z', end: '2024-01-15T10:00:00.500+00:00' })).toEqual([]);
  });
  /** @id TEST-VALIDATE-004 @verifies REQ-VALIDATE-004 */
  it('TEST-VALIDATE-004 end after start', () => {
    expect(fields({ ...good, end: good.start })).toEqual(['end']);
    expect(fields({ ...good, end: '2024-01-15T08:00:00+09:00' })).toEqual(['end']);
  });
  /** @id TEST-VALIDATE-005 @verifies REQ-VALIDATE-005 */
  it('TEST-VALIDATE-005 time zone', () => {
    expect(fields({ ...good, timeZone: 'Mars/Olympus' })).toEqual(['timeZone']);
    expect(fields({ ...good, timeZone: undefined })).toEqual(['timeZone']);
  });
  /** @id TEST-VALIDATE-006 @verifies REQ-VALIDATE-006 */
  it('TEST-VALIDATE-006 price', () => {
    expect(fields({ ...good, priceCents: -1 })).toEqual(['price']);
    expect(fields({ ...good, priceCents: 1.5 })).toEqual(['price']);
    expect(fields({ ...good, priceCents: '5' })).toEqual(['price']);
    expect(fields({ ...good, currency: 'jpy' })).toEqual(['price']);
    expect(fields({ ...good, priceCents: 0 })).toEqual([]);
  });
  /** @id TEST-VALIDATE-007 @verifies REQ-VALIDATE-007 */
  it('TEST-VALIDATE-007 value and error accumulation', () => {
    const r = validateCreateRequest(good);
    expect(r).toEqual({
      ok: true,
      value: {
        resource: 'room-1', timeZone: 'Asia/Tokyo',
        interval: { start: Date.UTC(2024, 0, 15, 0), end: Date.UTC(2024, 0, 15, 1) },
        price: { amount: 5000, currency: 'JPY' },
      },
    });
    expect(fields({ resource: '', start: 'x', end: 'y', timeZone: 'Q', priceCents: -1, currency: 'jpy' }).sort()).toEqual(['end', 'price', 'resource', 'start', 'timeZone']);
  });
});
