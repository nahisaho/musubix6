# app010-js-pubsub-broker

Zero-dependency JavaScript ESM in-memory broker; Node >=20.

```sh
npm test
npm run demo
node ../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs --root . gate
```

## API

Import `Broker` from `src/broker.js`. Lower layers (`Log`, `Groups`, `Offsets`,
`Delivery`) can also be used independently.

- `new Broker({clock, sessionTimeout, retentionMs, dedupeTtl})`: injected clock
  returns monotonic finite milliseconds. Defaults: `Date.now`, 30s sessions,
  no retention, 60s dedupe. `Infinity` disables retention/dedupe expiry.
- `createTopic(name, partitions=1)`, `topics()`, `read(topic, partition,
  {offset=0, limit=Number.MAX_SAFE_INTEGER})`.
- `publish(topic, value, {key, partition, idempotencyKey})`: explicit partition,
  UTF-8 FNV-1a key partitioning, otherwise round robin. Returns a detached
  record `{topic, partition, offset, timestamp, key, value}`.
- `join(group, member, subscriptions)`: returns a generation token. Membership
  changes invalidate previous tokens; refresh with `token(group, member)`.
  `assignments(token)`, `group(group)`, `leave(group, member)` inspect/change groups.
- `poll(token, {limit=100})`: deterministic topic/partition order, total cap.
  `commit(token, [{topic, partition, offset}])`: atomic monotonic **next offset**
  commits, bounded by delivered high-water marks. `committed(group, topic,
  partition)` reads acknowledgements. `seek(token, topic, partition, offset)`
  repositions only the local cursor.
- `transaction(token, id, {outputs:[{topic,value,options}], commits:[...]})`:
  atomic output append plus input acknowledgement. IDs are group-scoped;
  identical retries return detached original results even after rebalancing,
  provided the caller presents a current token.
- `fail(token, record, errorString, {maxAttempts=3, deadLetterTopic})`: retries the
  earliest retained uncommitted delivered record, or atomically writes a DLQ
  record with source/group/attempt/error and commits past it. DLQ must exist.
  Removed input is rejected rather than silently acknowledged. Internal DLQ
  identities never collide with user transaction IDs.
- `heartbeat(token)`, `maintenance({sessionTimeout, retentionMs, dedupeTtl})`:
  explicit deterministic maintenance, no background timers. Returns
  `{expiredMembers, prunedRecords, expiredDedupe}`.

## Guarantees and limits

All calls are synchronous and broker-owned effects are atomic. Exactly-once
means deduplication **within this process and the configured TTL**, not durable
recovery or external side effects. Producer IDs are topic-scoped and semantic
requests use `isDeepStrictEqual`. Transaction output dedupe uses its transaction
ID, not individual producer IDs. Payloads must support `structuredClone`; shared
buffers/views, including non-enumerable Error causes, are rejected.

Retention prunes timestamps strictly older than `now-retentionMs`, preserving
absolute offsets; polling clamps lagging commits to the retained base without
changing the commit. Session/dedupe expiry uses age >= configured duration.
One rebalance occurs per expired group per maintenance call.

The 5-feature, 45-REQ suite has 25 annotated tests, 4 independently discovered
bug-fix cycles, a key-encoding refactor, explicit characterization of the frozen
state table, and cross-feature impact evidence. `.sdd/review.md` records the
independent risk reviews. No external dependencies, persistence or networking.

Known skill issue: nested `gate --changed` misses git-root-relative status paths
and can falsely PASS without running tests. Always use the full gate here;
see `../findings/app010.md`.
