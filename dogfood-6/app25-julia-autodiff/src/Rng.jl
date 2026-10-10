module RngMod

export Rng, next_u64!, rand_f64!, rand_int!, randn!, shuffle!, split

const ZERO_SEED = 0x9E3779B97F4A7C15

# @id CODE-RNG-001 @implements REQ-RNG-001 REQ-RNG-002
mutable struct Rng
    state::UInt64
    spare::Union{Nothing,Float64}
    Rng(state::UInt64, spare::Union{Nothing,Float64}) = new(state == 0 ? ZERO_SEED : state, spare)
end
Rng(seed::Integer) = Rng(UInt64(seed % UInt64), nothing)

function next_u64!(r::Rng)
    x = r.state
    x ⊻= x >> 12
    x ⊻= x << 25
    x ⊻= x >> 27
    r.state = x
    x * 0x2545F4914F6CDD1D
end

# @id CODE-RNG-002 @implements REQ-RNG-003
rand_f64!(r::Rng) = Float64(next_u64!(r) >> 11) * 2.0^-53

# @id CODE-RNG-003 @implements REQ-RNG-004
function rand_int!(r::Rng, n::Integer)
    n >= 1 || throw(ArgumentError("rand_int! needs n >= 1, got $n"))
    un = UInt64(n)
    limit = typemax(UInt64) - typemax(UInt64) % un
    while true
        x = next_u64!(r)
        x < limit && return Int(x % un) + 1
    end
end

# @id CODE-RNG-004 @implements REQ-RNG-005
function randn!(r::Rng)
    if r.spare !== nothing
        z = r.spare
        r.spare = nothing
        return z
    end
    u1 = 1.0 - rand_f64!(r)
    u2 = rand_f64!(r)
    rad = sqrt(-2.0 * log(u1))
    r.spare = rad * sin(2π * u2)
    rad * cos(2π * u2)
end

# @id CODE-RNG-005 @implements REQ-RNG-006
function shuffle!(r::Rng, v::AbstractVector)
    for i in length(v):-1:2
        j = rand_int!(r, i)
        v[i], v[j] = v[j], v[i]
    end
    v
end

# @id CODE-RNG-006 @implements REQ-RNG-007 REQ-RNG-008
Base.split(r::Rng) = Rng(next_u64!(r))
Base.copy(r::Rng) = Rng(r.state, r.spare)

end # module RngMod
