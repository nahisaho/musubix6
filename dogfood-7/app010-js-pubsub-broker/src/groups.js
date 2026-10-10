import { Log, name, snapshot } from './log.js';

export class Groups extends Log {
  constructor(options) {
    super(options);
    this._groups = new Map();
  }

  /** @id CODE-GROUPS-001 @implements REQ-GROUPS-001 REQ-GROUPS-002 */
  join(group, member, subscriptions) {
    name(group, 'group');
    name(member, 'member');
    if (!Array.isArray(subscriptions) || !subscriptions.length ||
        new Set(subscriptions).size !== subscriptions.length) throw new TypeError('invalid subscriptions');
    for (const topic of subscriptions) this._topic(topic);
    let state = this._groups.get(group);
    if (state?.members.has(member)) throw new Error('member exists');
    const activity = this._now();
    if (!state) {
      state = { name: group, generation: 0, members: new Map(), assignments: new Map() };
      this._groups.set(group, state);
    }
    state.members.set(member, { subscriptions: [...subscriptions].sort(), activity });
    this._rebalance(state);
    return this.token(group, member);
  }

  _state(group) {
    const state = this._groups.get(group);
    if (!state) throw new Error('unknown group');
    return state;
  }

  /** @id CODE-GROUPS-002 @implements REQ-GROUPS-003 REQ-GROUPS-004 */
  _rebalance(state) {
    state.generation++;
    state.assignments = new Map([...state.members.keys()].sort().map(id => [id, []]));
    const topics = [...new Set([...state.members.values()].flatMap(m => m.subscriptions))].sort();
    for (const topic of topics) {
      const eligible = [...state.members.keys()].filter(id => state.members.get(id).subscriptions.includes(topic)).sort();
      for (let partition = 0; partition < this._topic(topic).partitions.length; partition++) {
        state.assignments.get(eligible[partition % eligible.length]).push({ topic, partition });
      }
    }
  }

  /** @id CODE-GROUPS-003 @implements REQ-GROUPS-005 REQ-GROUPS-006 */
  leave(group, member) {
    const state = this._state(group);
    if (!state.members.has(member)) throw new Error('unknown member');
    state.members.delete(member);
    this._rebalance(state);
    return state.generation;
  }

  /** @id CODE-GROUPS-004 @implements REQ-GROUPS-007 REQ-GROUPS-008 */
  group(group) {
    const state = this._state(group);
    return snapshot({ group, generation: state.generation,
      members: [...state.members.keys()].sort().map(id => ({ member: id, ...state.members.get(id) })) });
  }

  token(group, member) {
    const state = this._state(group);
    if (!state.members.has(member)) throw new Error('unknown member');
    return { group, member, generation: state.generation };
  }

  _fence(token) {
    if (!token || typeof token !== 'object') throw new TypeError('invalid token');
    const state = this._state(token.group);
    if (!state.members.has(token.member)) throw new Error('unknown member');
    if (token.generation !== state.generation) throw new Error('stale generation');
    return state;
  }

  assignments(token) {
    return snapshot(this._fence(token).assignments.get(token.member));
  }

  validate(token, topic, partition) {
    const state = this._fence(token);
    this._partition(topic, partition);
    if (!state.assignments.get(token.member).some(a => a.topic === topic && a.partition === partition)) {
      throw new Error('unowned partition');
    }
    return true;
  }
}
