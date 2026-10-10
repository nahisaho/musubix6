# Go recursive DNS resolver

Standard-library-only Go module with six library packages and a CLI.

```sh
go test -race ./...
go run ./cmd/dns -type A www.example.com.
go run ./cmd/dns -root 127.0.0.1:5353 -timeout 2s example.
```

- `wire`: bounded RFC DNS header/question/RR codec, suffix compression,
  pointer-loop rejection, typed NS/CNAME/SOA and opaque other RDATA.
- `cache`: mutex-protected LRU, deep copies, aged TTLs, RFC 2308-style
  negative expiry `min(SOA TTL, SOA minimum)`, injected clock.
- `dnssec`: **DNSSEC-lite only**, an explicitly non-interoperable Ed25519
  RR proof with canonical sorted records, original TTL, validity interval
  and key-to-zone trust binding. No DNSKEY/DS/NSEC wire chain support.
- `transport`: connected per-query UDP sockets, randomized transaction IDs,
  response matching, deadlines and context cancellation.
- `resolver`: injected exchange interface, suffix NS minimisation,
  progressing in-bailiwick glued referrals, bounded CNAME following,
  bundled CNAME answers and chain-minimum TTL caching. Returned positive
  answers are flattened to terminal records.
- `internal/name`: shared ASCII domain normalization and zone boundaries.

## Limits

No TCP fallback: TC is an explicit error. Only referrals with matching
in-bailiwick A/AAAA glue are followed. The first configured root is used;
root failover and independent NS address discovery are not implemented.
IDNA, EDNS and full RFC DNSSEC are out of scope.

Secure mode is a library option: inject `dnssec.Validator`, and implement
`resolver.ProofSource` on the exchanger for out-of-band proofs. Every
positive response (including CNAME links) is verified before following it.
Secure mode bypasses the shared cache and rejects authenticated denial
because DNSSEC-lite has no denial proofs. The UDP CLI is intentionally
not labeled DNSSEC-validated.

## Workflow evidence

Five T2 features, 40 requirements, 20 initial Red→Green tests and three
additional first-pass regression cycles cover alias-cache expiry,
contradictory signed NXDOMAIN and bundled CNAME traversal. Four further
regressions cover maximum compressed names, signed TTL inflation, negative
alias expiry and signature-expiry TTL capping. Specs were independently
reviewed and locked, then the resolver spec was amended/reviewed/relocked.
Generics are exercised by deep-copy refactoring; table tests and `t.Run`,
interfaces, `internal/`, build-tagged spikes and a `testdata` golden packet
are included. An additional loopback end-to-end test composes the actual
codec, UDP transport, resolver and cache. The spike runs with
`go run spike/main.go`. Gate runs race-enabled tests and
`go vet -composites=false ./...`; composite-literal warnings are disabled
for compact test fixtures, while all other vet checks remain enabled.
Four final regressions ensure earlier CNAME proofs cannot expire during
lookup and that whole/fractional traversal time never extends alias cache
lifetimes or proof validity, even at subsecond clock boundaries. Remaining
TTLs are conservatively rounded down. Library callers
may inject `Resolver.Clock` (and the matching cache clock) for ordinary TTL
tests; secure traversal uses `Validator.Clock`.

Run the workflow script from this app directory with `--root "$PWD"`.
Full gate is authoritative: the already-known nested-root changed-gate
path-scoping defect can produce a zero-test changed gate. It is not
counted as a new finding.
