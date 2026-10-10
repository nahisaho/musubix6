import { Groups } from './groups.js';
import { integer, snapshot } from './log.js';

export class Offsets extends Groups {
  constructor(options) {
    super(options);
    this._commits = new Map();
    this._cursors = new Map();
  }

  _commitKey(group, topic, partition) {
    return JSON.stringify([group, topic, partition]);
  }

  join(group, member, subscriptions) {
    const token = super.join(group, member, subscriptions);
    for (const topic of subscriptions) {
      this._topic(topic).partitions.forEach((part, partition) => {
        const key = this._commitKey(group, topic, partition);
        if (!this._commits.has(key)) this._commits.set(key, part.base);
      });
    }
    return token;
  }

  _rebalance(state) {
    super._rebalance(state);
    if (this._cursors) {
      for (const [key, cursor] of this._cursors) if (cursor.group === state.name) this._cursors.delete(key);
    }
  }

  _cursor(token, topic, partition) {
    const key = JSON.stringify([token.group, token.member, token.generation, topic, partition]);
    const start = this.committed(token.group, topic, partition);
    return { key, state: this._cursors.get(key) ?? { group: token.group, position: start, delivered: start } };
  }

  /** @id CODE-OFFSETS-001 @implements REQ-OFFSETS-001 REQ-OFFSETS-002 */
  poll(token, { limit = 100 } = {}) {
    integer(limit, 'limit', 1);
    const assignments = this.assignments(token);
    const result = [];
    const updates = [];
    for (const { topic, partition } of assignments) {
      if (result.length >= limit) break;
      const { key, state } = this._cursor(token, topic, partition);
      const part = this._partition(topic, partition);
      const position = Math.max(state.position, part.base);
      const records = this.read(topic, partition, { offset: position, limit: limit - result.length });
      const next = records.length ? records.at(-1).offset + 1 : position;
      updates.push([key, { ...state, position: next, delivered: Math.max(state.delivered, next) }]);
      result.push(...records);
    }
    for (const [key, state] of updates) this._cursors.set(key, state);
    return result;
  }

  /** @id CODE-OFFSETS-002 @implements REQ-OFFSETS-003 REQ-OFFSETS-004 REQ-DELIVERY-011 */
  _validateCommits(token, entries) {
    this._fence(token);
    if (!Array.isArray(entries) || !entries.length) throw new TypeError('invalid commits');
    const seen = new Set();
    return Array.from(entries, entry => {
      if (!entry || typeof entry !== 'object') throw new TypeError('invalid commit');
      const { topic, partition, offset } = entry;
      this.validate(token, topic, partition);
      integer(offset, 'offset');
      const key = this._commitKey(token.group, topic, partition);
      if (seen.has(key)) throw new Error('duplicate commit partition');
      seen.add(key);
      const committed = this.committed(token.group, topic, partition);
      if (offset < committed) throw new Error('commit rewind');
      if (offset > this._cursor(token, topic, partition).state.delivered) throw new Error('commit exceeds delivered position');
      return { key, topic, partition, offset };
    });
  }

  /** @id CODE-OFFSETS-003 @implements REQ-OFFSETS-005 REQ-OFFSETS-006 */
  commit(token, entries) {
    const planned = this._validateCommits(token, entries);
    for (const entry of planned) this._commits.set(entry.key, entry.offset);
    return snapshot(planned.map(({ topic, partition, offset }) => ({ topic, partition, offset })));
  }

  committed(group, topic, partition) {
    this._state(group);
    const part = this._partition(topic, partition);
    return this._commits.get(this._commitKey(group, topic, partition)) ?? part.base;
  }

  /** @id CODE-OFFSETS-004 @implements REQ-OFFSETS-007 REQ-OFFSETS-008 */
  seek(token, topic, partition, offset) {
    this.validate(token, topic, partition);
    integer(offset, 'offset');
    const part = this._partition(topic, partition);
    if (offset < part.base || offset > part.base + part.records.length) throw new RangeError('seek outside retained range');
    const { key, state } = this._cursor(token, topic, partition);
    this._cursors.set(key, { ...state, position: offset });
    return offset;
  }
}
