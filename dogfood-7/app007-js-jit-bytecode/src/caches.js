function property(key) {
  if (typeof key !== 'string') throw new TypeError('invalid property key');
}

class ShapeObject {
  #shape;
  #values;
  #registry;
  constructor(registry, shape, values) { this.#registry = registry; this.#shape = shape; this.#values = values; }
  static is(value) { return value !== null && typeof value === 'object' && #shape in value; }
  get shape() { return this.#shape; }
  slot(index) { return index < 0 ? undefined : this.#values[index]; }
  get(key) { property(key); return this.slot(this.#shape.keys.indexOf(key)); }
  /** @id CODE-IC-002 @implements REQ-IC-002 */
  set(key, value) {
    property(key);
    const index = this.#shape.keys.indexOf(key);
    if (index >= 0) this.#values[index] = value;
    else {
      this.#shape = this.#registry.intern([...this.#shape.keys, key]);
      this.#values.push(value);
    }
    return value;
  }
}

export const isShapeObject = value => ShapeObject.is(value);

/** @id CODE-IC-001 @implements REQ-IC-001 */
export class ShapeRegistry {
  #shapes = new Map();
  intern(keys) {
    const signature = JSON.stringify(keys);
    if (!this.#shapes.has(signature)) {
      this.#shapes.set(signature, Object.freeze({ id: this.#shapes.size, keys: Object.freeze([...keys]) }));
    }
    return this.#shapes.get(signature);
  }
  create(fields = {}) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new TypeError('invalid object fields');
    const entries = Object.entries(fields);
    return new ShapeObject(this, this.intern(entries.map(([key]) => key)), entries.map(([, value]) => value));
  }
}

/** @id CODE-IC-003 @implements REQ-IC-003, REQ-IC-004, REQ-IC-005, REQ-IC-006, REQ-IC-007, REQ-IC-008 */
export class InlineCache {
  #sites = new Map();
  #limit;
  constructor(limit = 4) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError('invalid cache limit');
    this.#limit = limit;
  }
  #validate(obj, key) {
    if (!isShapeObject(obj)) throw new TypeError('invalid shape object');
    property(key);
  }
  #site(site, key) {
    if (!this.#sites.has(site)) this.#sites.set(site, new Map());
    const keys = this.#sites.get(site);
    if (!keys.has(key)) keys.set(key, { state: 'empty', hits: 0, misses: 0, entries: new Map() });
    return keys.get(key);
  }
  get(site, obj, key) {
    this.#validate(obj, key);
    const entry = this.#site(site, key);
    if (entry.state !== 'megamorphic' && entry.entries.has(obj.shape)) {
      entry.hits++;
      return obj.slot(entry.entries.get(obj.shape));
    }
    entry.misses++;
    if (entry.state === 'megamorphic') return obj.get(key);
    const index = obj.shape.keys.indexOf(key);
    if (entry.entries.size >= this.#limit) {
      entry.state = 'megamorphic';
      entry.entries.clear();
    } else {
      entry.entries.set(obj.shape, index);
      entry.state = entry.entries.size === 1 ? 'monomorphic' : 'polymorphic';
    }
    return obj.slot(index);
  }
  set(site, obj, key, value) { this.#validate(obj, key); return obj.set(key, value); }
  stats(site, key) {
    property(key);
    const entry = this.#sites.get(site)?.get(key);
    return entry ? { state: entry.state, hits: entry.hits, misses: entry.misses, shapes: entry.entries.size } :
      { state: 'empty', hits: 0, misses: 0, shapes: 0 };
  }
}
