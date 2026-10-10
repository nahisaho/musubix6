import test from 'node:test';
import assert from 'node:assert/strict';
import { ArtifactCache, hash, buildKey } from '../src/index.ts';

/** @id TEST-CACHE-001 @verifies REQ-CACHE-001 */
test('TEST-CACHE-001 canonical SHA256', () => {
  assert.equal(hash({b:2,a:{d:4,c:3}}),hash({a:{c:3,d:4},b:2}));
  assert.equal(hash(null),'74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b');
});
/** @id TEST-CACHE-002 @verifies REQ-CACHE-002 */
test('TEST-CACHE-002 order and type distinctions', () => {
  assert.notEqual(hash([1,2]), hash([2,1]));
  assert.notEqual(hash(1), hash('1'));
});
/** @id TEST-CACHE-003 @verifies REQ-CACHE-003 */
test('TEST-CACHE-003 rejects lossy JSON', () => {
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  for (const value of [cycle, undefined, NaN, Infinity, 1n, new Date(), ()=>0]) {
    assert.throws(() => hash(value), /unsupported|cycle|finite/);
  }
  const shared = {x:1};
  assert.equal(hash([shared,shared]),hash([{x:1},{x:1}]));
});
/** @id TEST-CACHE-004 @verifies REQ-CACHE-004 */
test('TEST-CACHE-004 null is not a miss', () => {
  const cache = new ArtifactCache(2);
  cache.put('null', null);
  assert.deepEqual(cache.get('null'), {found:true,value:null});
  assert.deepEqual(cache.get('absent'), {found:false});
});
/** @id TEST-CACHE-005 @verifies REQ-CACHE-005 */
test('TEST-CACHE-005 copy boundaries', () => {
  const cache = new ArtifactCache(2); const value = {a:[1]};
  cache.put('x', value); value.a.push(2);
  const first = cache.get('x');
  assert.ok(first.found);
  (first.value as {a:number[]}).a.push(3);
  assert.deepEqual(cache.get('x'), {found:true,value:{a:[1]}});
});
/** @id TEST-CACHE-006 @verifies REQ-CACHE-006 */
test('TEST-CACHE-006 bounded LRU', () => {
  const cache = new ArtifactCache(2); cache.put('a',1); cache.put('b',2); cache.get('a'); cache.put('c',3);
  assert.equal(cache.get('b').found, false);
  assert.equal(cache.get('a').found, true);
  assert.throws(() => new ArtifactCache(0), /capacity/);
});
/** @id TEST-CACHE-007 @verifies REQ-CACHE-007 */
test('TEST-CACHE-007 dependency identity in build keys', () => {
  const key = buildKey('task','v1',{a:'x',b:'y'});
  assert.equal(key, buildKey('task','v1',{b:'y',a:'x'}));
  assert.notEqual(key,buildKey('task','v1',{a:'y',b:'x'}));
  assert.notEqual(key,buildKey('task','v2',{a:'x',b:'y'}));
  assert.notEqual(key,buildKey('other','v1',{a:'x',b:'y'}));
});
/** @id TEST-CACHE-008 @verifies REQ-CACHE-008 */
test('TEST-CACHE-008 deletion and counters', () => {
  const cache = new ArtifactCache(2); cache.put('a',1); cache.get('a'); cache.get('b'); cache.delete('a');
  assert.deepEqual(cache.stats(),{size:0,hits:1,misses:1});
  cache.put('c',3); cache.clear();
  assert.deepEqual(cache.stats(),{size:0,hits:0,misses:0});
});
/** @id TEST-CACHE-009 @verifies REQ-CACHE-009 */
test('TEST-CACHE-009 sparse array collision regression', () => {
  assert.throws(()=>hash(Array(1)), /sparse/);
  assert.throws(()=>hash([1,,2]), /sparse/);
  assert.notEqual(hash([]),hash([null]));
});
/** @id TEST-CACHE-010 @verifies REQ-CACHE-010 */
test('TEST-CACHE-010 metadata follows transactional cache artifacts', () => {
  const cache=new ArtifactCache(3); const metadata=['a'];
  cache.put('x',1,metadata);metadata.push('b');
  const lookup=cache.get('x');assert.ok(lookup.found);assert.deepEqual(lookup.metadata,['a']);
  (lookup.metadata as string[]).push('c');
  const staging=cache.fork();staging.put('y',2,['d']);
  assert.equal(cache.get('y').found,false);
  cache.publish(staging);
  assert.deepEqual(cache.get('x'),{found:true,value:1,metadata:['a']});
  assert.deepEqual(cache.get('y'),{found:true,value:2,metadata:['d']});
});
