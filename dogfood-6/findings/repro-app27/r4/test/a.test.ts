import { it, expect } from 'vitest';
import Foo, { Mode, type Opts, makeFoo as mk } from '../src/foo';
import * as util from '../src/util';
/** @id TEST-R-001 @verifies REQ-R-001 */
it('TEST-R-001 x', async () => {
  const o: Opts = { n: 1 };
  const f = new Foo<string>(o);
  expect(await f.run(Mode.Fast)).toBe(3);
  expect(mk().size).toBe(2);
  expect(util.sum([1, 2])).toBe(3);
  expect(Foo.VERSION).toBe('1');
});
