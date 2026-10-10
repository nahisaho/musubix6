import test from 'node:test';
import assert from 'node:assert/strict';
import { Graph } from '../src/index.ts';

/** @id TEST-GRAPH-001 @verifies REQ-GRAPH-001 */
test('TEST-GRAPH-001 deterministic topology', () => {
  const graph = new Graph([{id:'z', deps:['a','b']}, {id:'b',deps:[]}, {id:'a',deps:[]}]);
  assert.deepEqual(graph.topology(), ['a','b','z']);
});
/** @id TEST-GRAPH-002 @verifies REQ-GRAPH-002 */
test('TEST-GRAPH-002 invalid identities', () => {
  assert.throws(() => new Graph([{id:'a',deps:[]},{id:'a',deps:[]}]), /duplicate/);
  assert.throws(() => new Graph([{id:'',deps:[]}]), /empty/);
});
/** @id TEST-GRAPH-003 @verifies REQ-GRAPH-003 */
test('TEST-GRAPH-003 unknown edge', () => {
  assert.throws(() => new Graph([{id:'a',deps:['missing']}]), /unknown.*missing/);
});
/** @id TEST-GRAPH-004 @verifies REQ-GRAPH-004 */
test('TEST-GRAPH-004 cycle witness', () => {
  assert.throws(() => new Graph([{id:'a',deps:['b']},{id:'b',deps:['a']}]), /cycle: a -> b -> a/);
  assert.throws(() => new Graph([{id:'a',deps:['a']}]), /cycle: a -> a/);
});
/** @id TEST-GRAPH-005 @verifies REQ-GRAPH-005 */
test('TEST-GRAPH-005 target closure', () => {
  const graph = new Graph([{id:'a',deps:[]},{id:'b',deps:['a']},{id:'c',deps:[]}]);
  assert.deepEqual(graph.closure(['b']), ['a','b']);
  assert.deepEqual(graph.closure([]), []);
  assert.throws(() => graph.closure(['x']), /unknown/);
});
/** @id TEST-GRAPH-006 @verifies REQ-GRAPH-006 */
test('TEST-GRAPH-006 transactional edge replacement', () => {
  const graph = new Graph([{id:'a',deps:[]},{id:'b',deps:['a']}]);
  assert.throws(() => graph.replace('a',['b']), /cycle/);
  assert.deepEqual(graph.dependencies('a'), []);
  graph.replace('b',[]);
  assert.deepEqual(graph.dependencies('b'), []);
});
/** @id TEST-GRAPH-007 @verifies REQ-GRAPH-007 */
test('TEST-GRAPH-007 reverse diamond closure', () => {
  const graph = new Graph([{id:'a',deps:[]},{id:'b',deps:['a']},{id:'c',deps:['a']},{id:'d',deps:['b','c']}]);
  assert.deepEqual(graph.dependents('a'), ['b','c','d']);
});
/** @id TEST-GRAPH-008 @verifies REQ-GRAPH-008 */
test('TEST-GRAPH-008 immutable boundaries', () => {
  const deps = ['a','a'];
  const graph = new Graph([{id:'a',deps:[]},{id:'b',deps}]);
  deps.push('x');
  graph.dependencies('b').push('y');
  assert.deepEqual(graph.dependencies('b'), ['a']);
});
