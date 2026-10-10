---
feature: txn
tier: T2
approval: auto
---
# txn
Goal: Atomic compare-and-swap transactions (package `txn`): conditions over key metadata select a Then or Else branch applied in one revision.
Non-goals: nested transactions, range compares.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-TXN-001 | When a transaction has no compares, the engine shall run the Then branch and report Succeeded=true. | TEST-TXN-001 |
| REQ-TXN-002 | When any compare is false, the engine shall run the Else branch and report Succeeded=false; all compares shall hold for Then. | TEST-TXN-002 |
| REQ-TXN-003 | When comparing Version, CreateRev, ModRev, Value or Lease with Equal, NotEqual, Greater or Less, the engine shall evaluate the result against the key's current metadata. | TEST-TXN-003 |
| REQ-TXN-004 | While a compared key is missing, the engine shall treat Version, CreateRev, ModRev and Lease as 0 and every Value comparison as false. | TEST-TXN-004 |
| REQ-TXN-005 | When the chosen branch writes, the engine shall commit all writes under one revision; a read-only branch shall not change the revision. | TEST-TXN-005 |
| REQ-TXN-006 | If a branch writes the same key twice or both puts and deletes it, then the engine shall return ErrDuplicateKey and apply nothing; an unknown compare target shall return ErrBadCompare. | TEST-TXN-006 |
| REQ-TXN-007 | When a branch contains Get ops, the engine shall answer them from the state before the transaction's own writes. | TEST-TXN-007 |
| REQ-TXN-008 | If a Put names an unknown lease, then the engine shall return ErrLeaseNotFound and apply none of the branch; successful leased Puts shall attach the key to the lease. | TEST-TXN-008 |
| REQ-TXN-009 | While many goroutines run compare-and-swap loops on one key, the engine shall make each successful swap atomic so no increment is lost. | TEST-TXN-009 |

## Design
Components: `txn.Engine{Store, Leases}`; `Txn{Compares, Then, Else}`; evaluation runs inside `mvcc.Store.Apply(decide)` under the write lock so compare and write are atomic.
Compare table (target x missing key):

| Target | Present key | Missing key |
| --- | --- | --- |
| Version | version | 0 |
| CreateRev | create rev | 0 |
| ModRev | mod rev | 0 |
| Lease | lease id | 0 |
| Value | string compare | always false |

Invariants: Then/Else chosen before any write; validation (duplicates, leases) precedes any write; read ops see the pre-txn snapshot; revision +1 iff an effective write happened.
## Assumptions / risks
Lease validity is checked before Apply; a lease revoked between check and Apply is a documented race, not covered.
