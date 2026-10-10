---
feature: rng
tier: T2
---
# rng
Goal: deterministic seeded xorshift64* generator, reproducible across runs. Non-goals: cryptographic quality.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-RNG-001 | When Rng(seed) is created, the system shall produce the xorshift64* (shifts 12,25,27; multiplier 0x2545F4914F6CDD1D) sequence starting from state = seed, so two Rng with the same seed emit identical outputs. | TEST-RNG-001 |
| REQ-RNG-002 | If seed == 0, then the system shall substitute the constant 0x9E3779B97F4A7C15 so the state is never zero. | TEST-RNG-002 |
| REQ-RNG-003 | When rand_f64!(r) is called, the system shall return a Float64 in [0,1) built from the top 53 bits of next_u64!. | TEST-RNG-003 |
| REQ-RNG-004 | When rand_int!(r, n) is called with n >= 1, the system shall return an integer in 1:n using rejection sampling (no modulo bias); n < 1 shall throw ArgumentError. | TEST-RNG-004 |
| REQ-RNG-005 | When randn!(r) is called, the system shall return standard normals via Box-Muller, caching the spare so that two consecutive calls consume exactly two uniform draws in total, and sample mean/var over 20000 draws shall be within 0.05 of 0/1. | TEST-RNG-005 |
| REQ-RNG-006 | When shuffle!(r, v) is called, the system shall apply an in-place Fisher-Yates permutation: the result is a permutation of v and, over seeds, every permutation of 3 elements occurs. | TEST-RNG-006 |
| REQ-RNG-007 | When split(r) is called, the system shall return a child Rng whose stream differs from the parent's continuing stream and advance the parent by exactly one draw. | TEST-RNG-007 |
| REQ-RNG-008 | The system shall let copy(r) produce an independent Rng with identical future output without affecting the original. | TEST-RNG-008 |

## Design
Components: mutable struct Rng{state::UInt64, spare::Union{Nothing,Float64}}; pure functions over it.
| state field | invariant | enforced by |
| --- | --- | --- |
| state | != 0 always | constructor substitution (REQ-RNG-002); xorshift is a bijection on nonzero |
| spare | nothing or a pending normal | randn! consumes spare first; copy/split carry/clear it |
| rand_int! | rejection zone = typemax(UInt64) - typemax % n | REQ-RNG-004 |
Decisions: no global RNG; every consumer takes an Rng, so determinism is by construction.
## Assumptions / risks: UInt64 wraparound multiply is native in Julia (spike-checked); the known first outputs are verified against an independent Python reference (TEST-RNG-001).
