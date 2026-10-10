import { Delivery } from './delivery.js';

export const TRANSITIONS = Object.freeze({
  active: Object.freeze({ heartbeat: 'active', timeout: 'absent' }),
  absent: Object.freeze({ join: 'active', heartbeat: 'error' })
});

export class Broker extends Delivery {
  constructor(options = {}) {
    super(options);
    this._policy = this._options(options, {
      sessionTimeout: 30000, retentionMs: Infinity, dedupeTtl: 60000
    });
  }

  _options(options, defaults = this._policy) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('invalid maintenance options');
    const result = {};
    for (const key of ['sessionTimeout', 'retentionMs', 'dedupeTtl']) {
      const value = options[key] ?? defaults[key];
      if (typeof value !== 'number' || value <= 0 || Number.isNaN(value) ||
          (key === 'sessionTimeout' && !Number.isFinite(value))) throw new RangeError(`invalid ${key}`);
      result[key] = value;
    }
    return result;
  }

  /** @id CODE-LIFECYCLE-001 @implements REQ-LIFECYCLE-001 REQ-LIFECYCLE-002 */
  heartbeat(token) {
    const state = this._fence(token);
    const time = this._now();
    state.members.get(token.member).activity = time;
    return time;
  }

  _expireMembers(time, timeout) {
    let expired = 0;
    for (const state of this._groups.values()) {
      const members = [...state.members].filter(([, member]) => time - member.activity >= timeout);
      for (const [id] of members) state.members.delete(id);
      if (members.length) this._rebalance(state);
      expired += members.length;
    }
    return expired;
  }

  /** @id CODE-LIFECYCLE-002 @implements REQ-LIFECYCLE-003 REQ-LIFECYCLE-004 */
  _prune(time, retention) {
    let pruned = 0;
    for (const topic of this._log.values()) {
      for (const part of topic.partitions) {
        let count = 0;
        while (count < part.records.length && part.records[count].timestamp < time - retention) count++;
        part.records.splice(0, count);
        part.base += count;
        pruned += count;
      }
    }
    return pruned;
  }

  /** @id CODE-LIFECYCLE-003 @implements REQ-LIFECYCLE-005 REQ-LIFECYCLE-006 */
  _expireDedupe(time, ttl) {
    let expired = 0;
    for (const map of [this._dedupe, this._transactions]) {
      for (const [key, entry] of map) {
        if (time - entry.time >= ttl) { map.delete(key); expired++; }
      }
    }
    return expired;
  }

  /** @id CODE-LIFECYCLE-004 @implements REQ-LIFECYCLE-007 REQ-LIFECYCLE-008 */
  maintenance(options = {}) {
    const policy = this._options(options);
    const time = this._now();
    return {
      expiredMembers: this._expireMembers(time, policy.sessionTimeout),
      prunedRecords: this._prune(time, policy.retentionMs),
      expiredDedupe: this._expireDedupe(time, policy.dedupeTtl)
    };
  }
}
