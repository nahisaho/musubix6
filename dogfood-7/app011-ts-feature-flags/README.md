# Feature flag platform (app011)

Five TypeScript npm workspaces provide an in-memory control plane and an offline SDK.
Requires Node 24 (native TypeScript stripping).

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run spike
npm run demo
node ../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs --root "$PWD" gate
```

Run SDD commands **from this directory**, with `--root "$PWD"`.

```ts
import { ConfigStore } from '@flags/control';
import { Evaluator } from '@flags/sdk';
const store = new ConfigStore();
store.transact(0, 'operator', [{
  op: 'putFlag',
  flag: {
    key: 'checkout', enabled: true, defaultValue: false,
    rules: [{ when: 'country EQ "JP" AND plan IN ["pro", "team"]', value: true }],
    rollout: { percentage: 25, value: true, salt: 'experiment-v1' }
  }
}]);
const sdk = new Evaluator(store.snapshot());
sdk.evaluate('checkout', { key: 'alice', attributes: { country: 'JP', plan: 'pro' } }, false);
```

- **Rules:** case-sensitive `EQ NE GT GE LT LE IN AND OR NOT`; AND binds before OR.
  JSON literals, parentheses, finite numeric ordering, flat attribute names (dots are literal).
  Only own data properties are read (not prototypes or accessors). Missing attributes fail
  every comparison; NOT logically negates that result.
  Parsing is limited to 4096 characters and 64 nesting levels.
- **Rollout:** SHA-256 of JSON `[flag,user,salt]`, first big-endian uint32 modulo 10,000.
  Percentage boundaries are floored to basis points; variant weights have up to two decimals,
  are nonnegative and total 100. Increasing percentages preserves earlier assignments.
- **Segments:** up to 256 nodes; exclusions override explicit inclusion, OR rules and referenced
  membership. Unknown references, duplicate IDs and cycles fail publication.
- **Control:** synchronous compare-and-swap transactions publish all mutations or none.
  Every mutation is locally validated, even if later overwritten; graph references are validated
  on the complete candidate. Snapshots and hash-chained audit entries are isolated clones; semantic diffs sort IDs and
  escape JSON-pointer separators. Revision-only changes are not semantic differences.
- **SDK:** missing/disabled → fallback; first matching rule → rollout → variant → default.
  Updates validate fully before replacing config and require a newer revision.
  An injected finite clock controls local installation-age expiration; clock failures cannot
  partially publish updates.

This is a single-isolate local library, not a distributed persistence service. Actor strings
are attribution, not authentication. Unkeyed audit hashes detect corruption, not a privileged
attacker rewriting the entire history. No network access or credentials are involved.

SDD evidence: 48 requirements across five locked T2 features, three regression-fix cycles,
one refactor cycle, explicit workspace `projects`, two clean independent delta-review rounds.
Seven original stub Reds are explicitly weak; each has subsequent passing assertions.
The full gate, not the changed-scope shortcut, is the final acceptance check.
