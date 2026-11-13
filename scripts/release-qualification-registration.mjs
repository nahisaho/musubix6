import { test as nativeTest } from 'node:test';

/** @id CODE-RELQ-DISCOVERY-002 @implements REQ-RELQ-002 REQ-RELQ-003 */
export function test(name, options) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('explicit registration name required');
  if (options !== undefined && typeof options !== 'function' &&
      (!options || typeof options !== 'object' || Array.isArray(options))) {
    throw new Error('invalid registration options');
  }
  return nativeTest(name, { ...(typeof options === 'object' ? options : {}),
    only: false, todo: false, skip: 'test name does not match pattern' },
  () => { throw new Error('registration callback must never execute'); });
}

function hook(callback) {
  if (typeof callback !== 'function') throw new Error('invalid registration hook');
}

function unsupported(name) {
  const refuse = () => { throw new Error(`unsupported registration API: ${name}`); };
  return new Proxy(refuse, { get: refuse });
}

export const before = hook, after = hook, beforeEach = hook, afterEach = hook;
export const it = test;
export const describe = unsupported('describe'), suite = unsupported('suite');
export const mock = unsupported('mock');
Object.assign(test, { test, it, only: test, skip: test, todo: test,
  before, after, beforeEach, afterEach, describe, suite, mock });
export default test;
