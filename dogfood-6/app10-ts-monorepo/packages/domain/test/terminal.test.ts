import { it, expect } from 'vitest';
import { isTerminal } from '@bk/domain';

/** @id TEST-DOMAIN-009 @verifies REQ-DOMAIN-009 */
it('TEST-DOMAIN-009 terminal statuses', () => {
  expect(isTerminal('cancelled')).toBe(true);
  expect(isTerminal('completed')).toBe(true);
  expect(isTerminal('pending')).toBe(false);
  expect(isTerminal('confirmed')).toBe(false);
});
