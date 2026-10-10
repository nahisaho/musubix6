import { describe, it, expect } from 'vitest';
import { Box } from '../src/box';

describe('box', () => {
  /** @id TEST-R-001 @verifies REQ-R-001 */
  it('TEST-R-001 x', () => {
    const b = new Box();
    b.go();
    expect(b.n).toBe(1);
  });
});

describe('more', () => {
  /** @id TEST-R-002 @verifies REQ-R-001 */
  it('TEST-R-002 y', () => { expect(new Box().n).toBe(0); });
});
