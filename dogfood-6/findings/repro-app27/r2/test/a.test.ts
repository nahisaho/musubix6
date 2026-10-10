import { it, expect } from 'vitest';
import { Box } from '../src/box';
function mk() { const out: number[] = []; return { b: new Box((n: number) => out.push(n)), out }; }
/** @id TEST-R-001 @verifies REQ-R-001 */
it('TEST-R-001 x', () => {
  const { b, out } = mk();
  b.go();
  expect(out.map((x) => x + 1)).toEqual([2]);
});
