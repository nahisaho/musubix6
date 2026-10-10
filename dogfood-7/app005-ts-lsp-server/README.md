# Mini language server core

Node ≥24, TypeScript and `node:test`, with five npm workspaces and no runtime dependencies.

```sh
npm install --ignore-scripts
npm run typecheck
npm test
```

## Language

One statement per physical line; integer/identifier expressions joined by `+`, ASCII identifiers,
`//` comments and brace-only lexical scope boundaries. Declarations are visible after their initializer.
Forward references are undefined; duplicate declarations retain the first binding.

```text
let count = 1;
{
let count = count + 1;
print count;
}
print count;
```

## API

```ts
import {LanguageServer} from '@mini/diagnostics';

const server = new LanguageServer();
server.open('file:///example.mini', 'let count = 1;\nprint coun', 1);
const actions = server.actions('file:///example.mini');
server.apply(actions.find(a => a.title === 'Replace with count')!.edit, 2);
server.apply(server.actions('file:///example.mini')[0].edit, 3);
server.diagnostics('file:///example.mini'); // {uri, version:3, generation, items:[]}
const definition = server.definition('file:///example.mini', 21);
const edit = server.rename('file:///example.mini', 4, 'value', 3)!;
server.apply(edit, 4);
server.close('file:///example.mini');
```

* `@mini/text`: versioned document store, transactional sequential edits, copied snapshots,
  UTF-16 `positionAt`/`offsetAt` conversions. CRLF interior offsets are rejected; lone CR is content.
* `@mini/parser`: tolerant incremental line checkpoints. Unchanged lines at unchanged offsets reuse
  AST identity without tokenization; shifted lines are reparsed. Finding checkpoints still scans lines.
* `@mini/symbols`: lexical scope table, declaration/reference identities and exact source ranges.
* `@mini/navigation`: half-open offset-based definition, capture-safe rename, and atomic workspace edits.
* `@mini/diagnostics`: syntax/scope/duplicate/undefined errors, semicolon insertion, unique visible
  edit-distance-one typo actions, and server facade. Caches use weak document identity keys.

Ranges and cursor arguments are UTF-16 offsets, not LSP `Position` objects. Workspace edit offsets
address the original snapshot and apply in descending order. Text `change` batches are sequential.
Versions must be nonnegative safe integers and strictly increase on changes. Workspace edits also carry
a fresh generation per open, so reopening at an old version does not revalidate stale edits.
The core is synchronous, document-local and transport-independent; JSON-RPC and filesystem I/O are out of scope.

## Dogfood evidence

Five T2 features, 43 requirements, 43 annotated tests; 42 failing Reds plus one explicit test-only
facade characterization. Two regression cycles fixed lone-CR handling and closed-document cache retention;
the stable-record refactor preserves transactional rollback and copied snapshot behavior.
The GC regression runs in an isolated child process and permits 6MB of runtime overhead after
closing approximately 15MB of diagnosed text.

Specs, hash locks, the chained ledger, dependency plan and independent reviews are in `.sdd/`.
The runtime spike verified UTF-16, CRLF, integer-version and offset assumptions.
The nested `--root` changed-gate defect is documented in `../findings/app005.md`;
use a **full gate**, not `gate --changed`, as the authoritative validation.
