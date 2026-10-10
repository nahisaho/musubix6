import { isShapeObject } from './caches.js';

export const OPCODES = Object.freeze(Object.fromEntries(Object.entries({
  CONST: { size: 3, def: 1, uses: [] },
  MOV: { size: 3, def: 1, uses: [2] },
  ADD: { size: 4, def: 1, uses: [2, 3] },
  SUB: { size: 4, def: 1, uses: [2, 3] },
  MUL: { size: 4, def: 1, uses: [2, 3] },
  LT: { size: 4, def: 1, uses: [2, 3] },
  JMP: { size: 2, uses: [], target: 1 },
  JZ: { size: 3, uses: [1], target: 2 },
  GET: { size: 4, def: 1, uses: [2], key: 3 },
  SET: { size: 4, uses: [1, 3], key: 2 },
  RETURN: { size: 2, uses: [1] }
}).map(([op, schema]) => [op, Object.freeze({ ...schema, uses: Object.freeze(schema.uses) })])));

export function successors(code, pc) {
  const ins = code[pc];
  if (ins[0] === 'RETURN') return [];
  if (ins[0] === 'JMP') return [ins[1]];
  if (ins[0] === 'JZ') return [...new Set([ins[2], pc + 1])];
  return [pc + 1];
}

export function operands(ins) {
  const spec = OPCODES[ins[0]];
  return { uses: spec.uses.map(i => ins[i]), def: spec.def === undefined ? undefined : ins[spec.def] };
}

/** @id CODE-BC-009 @implements REQ-BC-009 */
function defaultAccess() {
  return {
    get: (site, obj, key) => isShapeObject(obj) ? obj.get(key) : obj[key],
    set: (site, obj, key, value) => isShapeObject(obj) ? obj.set(key, value) : (obj[key] = value)
  };
}

/** @id CODE-BC-004 @implements REQ-BC-004, REQ-BC-005 */
export function validate(program) {
  if (!program || !Array.isArray(program.code) || program.code.length === 0 ||
      !Number.isInteger(program.registers) || program.registers < 1 ||
      !Number.isInteger(program.arity) || program.arity < 0 || program.arity > program.registers) {
    throw new TypeError('invalid program metadata');
  }
  const { code, registers, arity } = program;
  for (const ins of code) {
    const spec = Array.isArray(ins) && OPCODES[ins[0]];
    if (!spec || ins.length !== spec.size) throw new TypeError('invalid opcode or instruction arity');
    const positions = [...spec.uses, ...(spec.def === undefined ? [] : [spec.def])];
    if (positions.some(i => !Number.isInteger(ins[i]) || ins[i] < 0 || ins[i] >= registers)) {
      throw new RangeError('invalid register');
    }
    if (spec.target !== undefined && (!Number.isInteger(ins[spec.target]) || ins[spec.target] < 0 || ins[spec.target] >= code.length)) {
      throw new RangeError('invalid jump target');
    }
    if (spec.key !== undefined && typeof ins[spec.key] !== 'string') throw new TypeError('invalid property');
    if (ins[0] === 'CONST' && ins[2] !== null && !['undefined', 'string', 'number', 'boolean', 'bigint'].includes(typeof ins[2])) {
      throw new TypeError('invalid constant');
    }
  }
  const reachable = new Set(), work = [0], predecessors = code.map(() => []);
  while (work.length) {
    const pc = work.pop();
    if (reachable.has(pc)) continue;
    if (pc >= code.length) throw new RangeError('reachable fallthrough');
    reachable.add(pc);
    for (const next of successors(code, pc)) {
      if (next >= code.length) throw new RangeError('reachable fallthrough');
      predecessors[next].push(pc);
      work.push(next);
    }
  }
  const all = Array.from({ length: registers }, (_, i) => i), inputs = new Set(all.slice(0, arity));
  const incoming = code.map(() => new Set(all)), outgoing = code.map(() => new Set(all));
  let changed = true;
  while (changed) {
    changed = false;
    for (const pc of reachable) {
      const parents = predecessors[pc].map(i => outgoing[i]);
      if (pc === 0) parents.push(inputs);
      const nextIn = new Set(all.filter(r => parents.every(s => s.has(r))));
      const nextOut = new Set(nextIn), { def } = operands(code[pc]);
      if (def !== undefined) nextOut.add(def);
      if (nextIn.size !== incoming[pc].size || nextOut.size !== outgoing[pc].size ||
          [...nextIn].some(r => !incoming[pc].has(r)) || [...nextOut].some(r => !outgoing[pc].has(r))) changed = true;
      incoming[pc] = nextIn;
      outgoing[pc] = nextOut;
    }
  }
  for (const pc of reachable) {
    for (const r of operands(code[pc]).uses) {
      if (!incoming[pc].has(r)) throw new ReferenceError(`uninitialized register ${r} at ${pc}`);
    }
  }
  return true;
}

/** @id CODE-BC-001 @implements REQ-BC-001, REQ-BC-002, REQ-BC-003, REQ-BC-006, REQ-BC-007, REQ-BC-008 */
export function executeProgram(program, args = [], options = {}) {
  validate(program);
  if (!Array.isArray(args) || args.length !== program.arity) throw new RangeError('invalid invocation arity');
  const budget = options.budget ?? 100000;
  if (!Number.isInteger(budget) || budget < 1) throw new RangeError('invalid instruction budget');
  const registers = Array(program.registers);
  const storage = options.storage ?? { get: r => registers[r], set: (r, value) => { registers[r] = value; } };
  const get = r => storage.get(r), set = (r, value) => storage.set(r, value);
  args.forEach((value, r) => { if (!options.inputRegisters || options.inputRegisters.has(r)) set(r, value); });
  const cache = options.cache ?? defaultAccess();
  const read = cache.get.bind(cache), write = cache.set.bind(cache);
  let pc = 0, steps = 0;
  while (true) {
    if (steps++ >= budget) throw new RangeError('instruction budget exceeded');
    options.onInstruction?.(pc, get);
    const [op, a, b, c] = program.code[pc];
    switch (op) {
      case 'CONST': set(a, b); break;
      case 'MOV': set(a, get(b)); break;
      case 'ADD': set(a, get(b) + get(c)); break;
      case 'SUB': set(a, get(b) - get(c)); break;
      case 'MUL': set(a, get(b) * get(c)); break;
      case 'LT': set(a, get(b) < get(c)); break;
      case 'JMP': pc = a; continue;
      case 'JZ': if (!get(a)) { pc = b; continue; } break;
      case 'GET': set(a, read(pc, get(b), c)); break;
      case 'SET': write(pc, get(a), b, get(c)); break;
      case 'RETURN': return get(a);
    }
    pc++;
  }
}

export class VM {
  run(program, args = [], options = {}) { return executeProgram(program, args, options); }
}
