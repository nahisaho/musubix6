import { validate, operands, successors, executeProgram } from './bytecode.js';

/** @id CODE-RA-001 @implements REQ-RA-001, REQ-RA-006 */
export function liveness(program) {
  validate(program);
  const { code } = program, liveIn = code.map(() => new Set()), liveOut = code.map(() => new Set());
  let changed = true;
  while (changed) {
    changed = false;
    for (let pc = code.length - 1; pc >= 0; pc--) {
      const { uses, def } = operands(code[pc]), out = new Set();
      for (const next of successors(code, pc)) for (const r of liveIn[next] ?? []) out.add(r);
      const incoming = new Set([...uses, ...[...out].filter(r => r !== def)]);
      if (incoming.size !== liveIn[pc].size || out.size !== liveOut[pc].size ||
          [...incoming].some(r => !liveIn[pc].has(r)) || [...out].some(r => !liveOut[pc].has(r))) changed = true;
      liveIn[pc] = incoming;
      liveOut[pc] = out;
    }
  }
  return { liveIn, liveOut };
}

/** @id CODE-RA-002 @implements REQ-RA-002, REQ-RA-003, REQ-RA-004, REQ-RA-007, REQ-RA-008 */
export function allocate(program, registerBudget = 4) {
  if (!Number.isInteger(registerBudget) || registerBudget < 1) throw new RangeError('invalid register budget');
  const live = liveness(program), graph = Array.from({ length: program.registers }, () => new Set());
  const edge = (a, b) => { if (a !== b) { graph[a].add(b); graph[b].add(a); } };
  program.code.forEach((ins, pc) => {
    const { def } = operands(ins);
    if (def !== undefined) for (const r of live.liveOut[pc]) edge(def, r);
    const inputs = [...live.liveIn[pc]];
    for (let i = 0; i < inputs.length; i++) for (let j = i + 1; j < inputs.length; j++) edge(inputs[i], inputs[j]);
  });
  const order = graph.map((_, r) => r).sort((a, b) => graph[b].size - graph[a].size || a - b);
  const locations = Array(program.registers);
  let spillCount = 0;
  for (const r of order) {
    const neighbors = [...graph[r]].map(n => locations[n]).filter(Boolean);
    let index = 0;
    while (index < registerBudget && neighbors.some(loc => loc.kind === 'register' && loc.index === index)) index++;
    if (index < registerBudget) locations[r] = Object.freeze({ kind: 'register', index });
    else {
      index = 0;
      while (neighbors.some(loc => loc.kind === 'spill' && loc.index === index)) index++;
      spillCount = Math.max(spillCount, index + 1);
      locations[r] = Object.freeze({ kind: 'spill', index });
    }
  }
  const snapshot = Object.freeze({ ...program, code: Object.freeze(program.code.map(ins => Object.freeze([...ins]))) });
  return Object.freeze({ program: snapshot, locations: Object.freeze(locations), registerBudget, spillCount, live });
}

/** @id CODE-RA-005 @implements REQ-RA-005 */
export function executeAllocated(allocation, args = [], options = {}) {
  const physical = Array(allocation.registerBudget), spills = Array(allocation.spillCount);
  const storage = {
    get(r) { const loc = allocation.locations[r]; return (loc.kind === 'register' ? physical : spills)[loc.index]; },
    set(r, value) { const loc = allocation.locations[r]; (loc.kind === 'register' ? physical : spills)[loc.index] = value; }
  };
  return executeProgram(allocation.program, args, { ...options, storage, inputRegisters: allocation.live.liveIn[0] });
}
