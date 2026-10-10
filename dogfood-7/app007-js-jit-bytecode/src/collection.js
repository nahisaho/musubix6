import { ShapeRegistry } from './caches.js';

const handles = new WeakSet();

/** @id CODE-GC-001 @implements REQ-GC-001, REQ-GC-005, REQ-GC-006 */
export class Heap {
  #capacity;
  #objects = [];
  #table = new Map();
  #roots = new Set();
  #temporary = new Map();
  #registry = new ShapeRegistry();
  #nextId = 0;
  constructor(capacity = 1024) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('invalid heap capacity');
    this.#capacity = capacity;
  }
  static isHandle(value) { return value !== null && typeof value === 'object' && handles.has(value); }
  #valid(handle) {
    if (!Heap.isHandle(handle) || !this.#table.has(handle)) throw new ReferenceError('invalid, foreign or dead handle');
  }
  #validateRoots(roots) {
    if (!Array.isArray(roots)) throw new TypeError('invalid root list');
    for (const root of roots) this.#valid(root);
  }
  #validateValue(value) { if (Heap.isHandle(value)) this.#valid(value); }
  allocate(fields = {}, roots = []) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new TypeError('invalid object fields');
    this.#validateRoots(roots);
    const refs = [];
    for (const value of Object.values(fields)) {
      this.#validateValue(value);
      if (Heap.isHandle(value)) refs.push(value);
    }
    if (this.#objects.length >= this.#capacity) this.collect([...roots, ...refs]);
    if (this.#objects.length >= this.#capacity) throw new RangeError('OutOfMemory: all heap objects are live');
    const handle = Object.freeze({ id: this.#nextId++ });
    handles.add(handle);
    this.#table.set(handle, this.#objects.length);
    this.#objects.push({ handle, object: this.#registry.create(fields) });
    return handle;
  }
  address(handle) { this.#valid(handle); return this.#table.get(handle); }
  resolve(handle) { return this.#objects[this.address(handle)].object; }
  get(handle, key) { return this.resolve(handle).get(key); }

  /** @id CODE-GC-007 @implements REQ-GC-007 */
  set(handle, key, value) {
    const object = this.resolve(handle);
    if (typeof key !== 'string') throw new TypeError('invalid property key');
    this.#validateValue(value);
    return object.set(key, value);
  }
  addRoot(handle) { this.#valid(handle); this.#roots.add(handle); }
  removeRoot(handle) { this.#roots.delete(handle); }
  withRoots(roots, action) {
    this.#validateRoots(roots);
    for (const root of roots) this.#temporary.set(root, (this.#temporary.get(root) ?? 0) + 1);
    try { return action(); }
    finally {
      for (const root of roots) {
        const count = this.#temporary.get(root) - 1;
        if (count === 0) this.#temporary.delete(root);
        else this.#temporary.set(root, count);
      }
    }
  }

  /** @id CODE-GC-002 @implements REQ-GC-002, REQ-GC-003, REQ-GC-004, REQ-GC-008 */
  collect(roots = []) {
    this.#validateRoots(roots);
    const marked = new Set(), work = [...this.#roots, ...this.#temporary.keys(), ...roots];
    while (work.length) {
      const handle = work.pop();
      if (marked.has(handle)) continue;
      this.#valid(handle);
      marked.add(handle);
      const object = this.resolve(handle);
      for (const key of object.shape.keys) {
        const value = object.get(key);
        if (Heap.isHandle(value)) work.push(value);
      }
    }
    const compacted = [];
    let moved = 0;
    this.#objects.forEach((entry, address) => {
      if (marked.has(entry.handle)) {
        if (address !== compacted.length) moved++;
        this.#table.set(entry.handle, compacted.length);
        compacted.push(entry);
      } else this.#table.delete(entry.handle);
    });
    const reclaimed = this.#objects.length - compacted.length;
    this.#objects = compacted;
    return { marked: marked.size, reclaimed, moved, live: compacted.length };
  }
}
