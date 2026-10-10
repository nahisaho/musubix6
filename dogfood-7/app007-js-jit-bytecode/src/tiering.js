import { VM, validate, operands, OPCODES } from './bytecode.js';
import { allocate, executeAllocated, liveness } from './allocation.js';
import { InlineCache } from './caches.js';
import { Heap } from './collection.js';

export const LIFECYCLE = Object.freeze({
  cold: Object.freeze({ baseline: 'baseline', invalidate: 'cold' }),
  baseline: Object.freeze({ optimize: 'optimized', invalidate: 'baseline' }),
  optimized: Object.freeze({ deopt: 'baseline', invalidate: 'baseline' })
});

const snapshot = program => Object.freeze({ ...program, code: Object.freeze(program.code.map(ins => Object.freeze([...ins]))) });

/** @id CODE-OPT-003 @implements REQ-OPT-003 */
export function optimize(program) {
  validate(program);
  const constants = new Map(), leaders = new Set([0]), code = [], binary = {
    ADD: (a, b) => a + b, SUB: (a, b) => a - b, MUL: (a, b) => a * b, LT: (a, b) => a < b
  };
  let folded = 0;
  program.code.forEach((ins, pc) => {
    const target = OPCODES[ins[0]].target;
    if (target !== undefined) { leaders.add(ins[target]); leaders.add(pc + 1); }
    if (ins[0] === 'RETURN') leaders.add(pc + 1);
  });
  program.code.forEach((ins, pc) => {
    if (leaders.has(pc)) constants.clear();
    const [op, dest, a, b] = ins, { def } = operands(ins);
    let transformed = [...ins];
    if (op === 'CONST') constants.set(dest, a);
    else if (op === 'MOV' && constants.has(a)) {
      transformed = ['CONST', dest, constants.get(a)];
      constants.set(dest, constants.get(a)); folded++;
    } else if (binary[op] && constants.has(a) && constants.has(b)) {
      try {
        const value = binary[op](constants.get(a), constants.get(b));
        transformed = ['CONST', dest, value];
        constants.set(dest, value); folded++;
      } catch {
        // Mixed BigInt/Number arithmetic must still throw at execution, not compilation.
        constants.delete(dest);
      }
    } else if (def !== undefined) constants.delete(def);
    code.push(transformed);
  });
  return { ...snapshot({ ...program, code }), folded };
}

/** @id CODE-OPT-001 @implements REQ-OPT-001, REQ-OPT-002, REQ-OPT-007 */
export class TieredEngine {
  #functions = new Map();
  #baselineThreshold;
  #optimizeThreshold;
  #physicalRegisters;
  #heap;
  #onInstruction;
  #vm = new VM();
  constructor({ baselineThreshold = 3, optimizeThreshold = 8, physicalRegisters = 4, heap, onInstruction } = {}) {
    if (!Number.isInteger(baselineThreshold) || baselineThreshold < 1 ||
        !Number.isInteger(optimizeThreshold) || optimizeThreshold <= baselineThreshold) throw new RangeError('invalid tier threshold');
    if (!Number.isInteger(physicalRegisters) || physicalRegisters < 1) throw new RangeError('invalid physical register budget');
    if (heap !== undefined && !(heap instanceof Heap)) throw new TypeError('invalid heap');
    if (onInstruction !== undefined && typeof onInstruction !== 'function') throw new TypeError('invalid instruction hook');
    this.#baselineThreshold = baselineThreshold;
    this.#optimizeThreshold = optimizeThreshold;
    this.#physicalRegisters = physicalRegisters;
    this.#heap = heap;
    this.#onInstruction = onInstruction;
  }
  define(name, program) {
    if (typeof name !== 'string' || !name || this.#functions.has(name)) throw new TypeError('invalid or duplicate function name');
    validate(program);
    this.#functions.set(name, { program: snapshot(program), state: 'cold', calls: 0, deopts: 0, lastDeopt: null,
      baseline: null, optimized: null, folded: 0, cache: new InlineCache(), live: liveness(program) });
  }
  #function(name) {
    const fn = this.#functions.get(name);
    if (!fn) throw new ReferenceError('unknown function');
    return fn;
  }
  #transition(fn, event) {
    const next = LIFECYCLE[fn.state][event];
    if (!next) throw new Error(`illegal lifecycle transition ${fn.state}:${event}`);
    fn.state = next;
  }
  info(name) {
    const fn = this.#function(name);
    return { state: fn.state, calls: fn.calls, deopts: fn.deopts, lastDeopt: fn.lastDeopt,
      folded: fn.folded, optimized: fn.optimized !== null };
  }
  invalidate(name) {
    const fn = this.#function(name);
    this.#transition(fn, 'invalidate');
    fn.optimized = null;
  }
  #object(value) {
    if (!Heap.isHandle(value)) return value;
    if (!this.#heap) throw new ReferenceError('heap required for handle');
    return this.#heap.resolve(value);
  }
  #guard(value) {
    return { type: value === null ? 'null' : typeof value, shape: this.#object(value)?.shape };
  }

  /** @id CODE-OPT-009 @implements REQ-OPT-009 */
  #instruction(pc, get, live) {
    if (!this.#onInstruction) return;
    const roots = [...live.liveIn[pc]].map(get).filter(Heap.isHandle);
    if (roots.length) {
      if (!this.#heap) throw new ReferenceError('heap required for handle');
      return this.#heap.withRoots(roots, () => this.#onInstruction(pc));
    }
    return this.#onInstruction(pc);
  }

  /** @id CODE-OPT-004 @implements REQ-OPT-004, REQ-OPT-005, REQ-OPT-006, REQ-OPT-008, REQ-OPT-010 */
  call(name, args = [], options = {}) {
    const fn = this.#function(name);
    if (!Array.isArray(args) || args.length !== fn.program.arity) throw new RangeError('invalid invocation arity');
    args = Array.from(args);
    const roots = args.filter(Heap.isHandle);
    const invoke = () => {
      const guards = args.map(value => this.#guard(value));
      let deoptimized = false;
      if (fn.optimized) {
        for (let i = 0; i < guards.length; i++) {
          const expected = fn.optimized.guards[i], current = guards[i];
          const reason = current.type !== expected.type ? 'argument type guard' : current.shape !== expected.shape ? 'object shape guard' : null;
          if (reason) {
            this.#transition(fn, 'deopt');
            fn.optimized = null; fn.deopts++; fn.lastDeopt = reason;
            deoptimized = true;
            break;
          }
        }
      }
      const cache = {
        get: (site, value, key) => fn.cache.get(site, this.#object(value), key),
        set: (site, value, key, field) => Heap.isHandle(value) ? this.#heap.set(value, key, field) :
          fn.cache.set(site, value, key, field)
      };
      const allocation = fn.optimized?.allocation ?? fn.baseline;
      const live = allocation?.live ?? fn.live;
      const runtime = { ...options, cache, onInstruction: (pc, get) => this.#instruction(pc, get, live) };
      const result = allocation ? executeAllocated(allocation, args, runtime) : this.#vm.run(fn.program, args, runtime);
      fn.calls++;
      if (fn.state === 'cold' && fn.calls >= this.#baselineThreshold) {
        fn.baseline = allocate(fn.program, this.#physicalRegisters);
        this.#transition(fn, 'baseline');
      }
      if (!deoptimized && fn.state === 'baseline' && fn.calls >= this.#optimizeThreshold) {
        const optimized = optimize(fn.program);
        fn.optimized = { allocation: allocate(optimized, this.#physicalRegisters), guards };
        fn.folded = optimized.folded;
        this.#transition(fn, 'optimize');
      }
      return result;
    };
    if (roots.length) {
      if (!this.#heap) throw new ReferenceError('heap required for handle');
      return this.#heap.withRoots(roots, invoke);
    }
    return invoke();
  }
}
