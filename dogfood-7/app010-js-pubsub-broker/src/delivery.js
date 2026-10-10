import { Offsets } from './offsets.js';
import { integer, snapshot } from './log.js';
import { isDeepStrictEqual } from 'node:util';

export class Delivery extends Offsets {
  constructor(options) {
    super(options);
    this._dedupe = new Map();
    this._transactions = new Map();
    this._failures = new Map();
  }

  _id(id) {
    if (typeof id !== 'string' || !id.length) throw new TypeError('invalid idempotency ID');
    return id;
  }

  /** @id CODE-DELIVERY-001 @implements REQ-DELIVERY-001 REQ-DELIVERY-002 */
  publish(topic, value, options = {}) {
    const plan = this._prepare(topic, value, options);
    const id = options.idempotencyKey;
    if (id === undefined) return snapshot(this._append(plan, this._now()));
    this._id(id);
    const mapKey = JSON.stringify([topic, id]);
    const request = { value: plan.value, key: options.key ?? null, partition: options.partition ?? null };
    const saved = this._dedupe.get(mapKey);
    if (saved) {
      if (!isDeepStrictEqual(saved.request, request)) throw new Error('idempotency conflict');
      return snapshot(saved.result);
    }
    const time = this._now();
    const result = this._append(plan, time);
    this._dedupe.set(mapKey, { request, result, time });
    return snapshot(result);
  }

  /** @id CODE-DELIVERY-002 @implements REQ-DELIVERY-003 REQ-DELIVERY-004 REQ-DELIVERY-011 */
  _stage(request) {
    if (!request || typeof request !== 'object' || !Array.isArray(request.outputs) ||
        !Array.isArray(request.commits)) throw new TypeError('invalid transaction');
    const stagedLog = snapshot(this._log);
    const records = Array.from(request.outputs, output => {
      if (!output || typeof output !== 'object') throw new TypeError('invalid output');
      if (output.options?.idempotencyKey !== undefined) throw new TypeError('transaction outputs use transaction ID');
      const plan = this._prepare(output.topic, output.value, output.options, stagedLog);
      return this._append(plan, 0, stagedLog);
    });
    return { stagedLog, records };
  }

  /** @id CODE-DELIVERY-005 @implements REQ-DELIVERY-009 */
  transaction(token, id, input) {
    return this._transaction(token, id, input, 'user');
  }

  /** @id CODE-DELIVERY-003 @implements REQ-DELIVERY-005 REQ-DELIVERY-006 */
  _transaction(token, id, input, namespace) {
    this._fence(token);
    this._id(id);
    const request = snapshot(input);
    const key = JSON.stringify([namespace, token.group, id]);
    const saved = this._transactions.get(key);
    if (saved) {
      if (!isDeepStrictEqual(saved.request, request)) throw new Error('transaction conflict');
      return snapshot(saved.result);
    }
    const commits = this._validateCommits(token, request?.commits);
    const { stagedLog, records } = this._stage(request);
    const time = this._now();
    for (const record of records) record.timestamp = time;
    this._log = stagedLog;
    for (const entry of commits) this._commits.set(entry.key, entry.offset);
    this._transactions.set(key, { request, result: records, time });
    return snapshot(records);
  }

  /** @id CODE-DELIVERY-004 @implements REQ-DELIVERY-007 REQ-DELIVERY-008 REQ-DELIVERY-010 */
  fail(token, input, error, { maxAttempts = 3, deadLetterTopic } = {}) {
    this.validate(token, input.topic, input.partition);
    integer(maxAttempts, 'maxAttempts', 1);
    integer(input.offset, 'offset');
    if (typeof error !== 'string') throw new TypeError('invalid error');
    this._topic(deadLetterTopic);
    const key = JSON.stringify([token.group, input.topic, input.partition, input.offset]);
    const prior = this._failures.get(key);
    if (prior?.deadLettered) return { attempts: prior.attempts, deadLettered: true };
    const part = this._partition(input.topic, input.partition);
    const stored = part.records[input.offset - part.base];
    if (!stored) throw new Error('input outside retained range');
    if (!isDeepStrictEqual(stored, input)) throw new Error('input does not match delivered record');
    if (input.offset !== Math.max(part.base, this.committed(token.group, input.topic, input.partition))) {
      throw new Error('failure must be in committed order');
    }
    if (input.offset >= this._cursor(token, input.topic, input.partition).state.delivered) {
      throw new Error('input was not delivered');
    }
    const attempts = (prior?.attempts ?? 0) + 1;
    if (attempts < maxAttempts) {
      this.seek(token, input.topic, input.partition, input.offset);
      this._failures.set(key, { attempts, deadLettered: false });
      return { attempts, deadLettered: false };
    }
    this._transaction(token, key, {
      outputs: [{ topic: deadLetterTopic, value: { source: input, group: token.group, attempts, error } }],
      commits: [{ topic: input.topic, partition: input.partition, offset: input.offset + 1 }]
    }, 'dlq');
    this._failures.set(key, { attempts, deadLettered: true });
    return { attempts, deadLettered: true };
  }
}
