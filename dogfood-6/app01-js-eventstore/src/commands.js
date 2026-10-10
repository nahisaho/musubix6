import { ConcurrencyError } from './store.js';
import { loadAggregate, maybeSnapshot } from './snapshots.js';
import * as inventory from './inventory.js';
import * as orders from './orders.js';

export class UnknownCommandError extends Error {
  constructor(type) {
    super(`unknown command type: ${type}`);
    this.name = 'UnknownCommandError';
  }
}

const AGGREGATES = {
  inventory: { module: inventory, key: 'sku' },
  order: { module: orders, key: 'orderId' },
};

const ACTIONS = {
  inventory: ['receive', 'reserve', 'release', 'ship'],
  order: ['place', 'pay', 'ship', 'cancel'],
};

function route(cmd) {
  const [prefix, ...rest] = String(cmd.type).split('-');
  const action = rest.join('-');
  const agg = AGGREGATES[prefix];
  if (!agg || !ACTIONS[prefix].includes(action)) throw new UnknownCommandError(cmd.type);
  const key = cmd[agg.key];
  if (typeof key !== 'string' || key === '') throw new TypeError(`${agg.key} must be a non-empty string`);
  return { agg: agg.module, streamId: `${prefix}-${key}`, command: { ...cmd, type: action } };
}

/** @id CODE-CMD-001 @implements REQ-CMD-001 REQ-CMD-002 REQ-CMD-003 REQ-CMD-004 REQ-CMD-005 REQ-CMD-006 REQ-CMD-007 REQ-CMD-008 REQ-CMD-009 REQ-CMD-010 */
export class CommandHandler {
  #store;
  #snapshots;
  #interval;
  #maxRetries;

  constructor({ store, snapshots = null, interval = 0, maxRetries = 3 }) {
    this.#store = store;
    this.#snapshots = snapshots;
    this.#interval = interval;
    this.#maxRetries = maxRetries;
  }

  handle(cmd) {
    if (typeof cmd?.commandId !== 'string' || cmd.commandId === '') {
      throw new TypeError('commandId must be a non-empty string');
    }
    const prior = this.#store.findByCommandId(cmd.commandId);
    if (prior.length > 0) return { events: prior, version: prior[prior.length - 1].version };

    const { agg, streamId, command } = route(cmd);
    for (let attempt = 0; ; attempt++) {
      const { state, version } = this.#load(streamId, agg);
      const decided = agg.decide(state, command).map((e) => ({ ...e, meta: { commandId: cmd.commandId } }));
      try {
        const events = this.#store.append(streamId, version, decided);
        const last = events[events.length - 1];
        this.#snapshot(streamId, last.version, decided.reduce(agg.evolve, state));
        return { events, version: last.version };
      } catch (err) {
        if (!(err instanceof ConcurrencyError) || attempt >= this.#maxRetries) throw err;
      }
    }
  }

  #load(streamId, agg) {
    const snaps = this.#snapshots ?? { get: () => null };
    return loadAggregate(this.#store, snaps, streamId, agg.evolve, agg.initialState);
  }

  #snapshot(streamId, version, state) {
    if (!this.#snapshots || !this.#interval) return;
    maybeSnapshot(this.#snapshots, streamId, state, version, this.#interval);
  }
}
