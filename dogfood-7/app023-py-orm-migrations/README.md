# app023: mini ORM and schema migrations

Python 3.12 or newer, SQLite, pytest only. Run `python3 -m pytest -q` here.

Modules:
- `orm.model`: ordered inherited metaclasses, typed descriptors, isolated defaults.
- `orm.query`: immutable SELECT builder, bound filters/limits, validated identifiers.
- `orm.work`: identity map, dirty tracking, atomic commits and explicit transaction contexts.
- `orm.relation`: many-to-one lazy loading and batched parent/child prefetch.
- `orm.migration`: immutable schema snapshots, deterministic diffs, transactional plans.

Declare exactly one integer primary key using `Field(int, primary_key=True)`.
New objects have a `None` key; `Session.add` and `commit` insert them. Objects
loaded by `get`/`all` are tracked automatically; mutate then commit. Never share
a Session across threads or supply a connection with an external transaction.
`with session.transaction():` commits once at successful exit; nested contexts
and explicit `commit()` inside a context are rejected.
Autocommit-mode connections are supported; SQL COMMIT/ROLLBACK close the explicit
transaction independently of Python connection autocommit settings.

Relationships accept only objects belonging to their Session. Prefetch avoids
N+1 queries; child collections group by persisted query membership, preserving
dirty in-memory fields on identity-mapped objects. Migration plans reject rebuilds
and unsafe NOT NULL additions. Destructive plans require explicit permission.
Tests and runtime spikes operate exclusively on disposable in-memory databases.

Workflow artifacts live in `.sdd/`: five T2 specs, plan, independent review,
hash locks, and Red/Green/refactor evidence. Run the workflow script with both
cwd and `--root` set to this directory to avoid the known nested-root bug.
