using Test
include("../src/Rng.jl")
using .RngMod

@testset "rng" begin

# @id TEST-RNG-001 @verifies REQ-RNG-001
@testset "TEST-RNG-001 xorshift64star reference stream" begin
    r = Rng(1)
    @test next_u64!(r) == 0x47e4ce4b896cdd1d
    @test next_u64!(r) == 0xabcfa6a8e079651d
    @test next_u64!(r) == 0xb9d10d8feb731f57
    a = Rng(42); b = Rng(42)
    @test [next_u64!(a) for _ in 1:20] == [next_u64!(b) for _ in 1:20]
    @test next_u64!(Rng(42)) != next_u64!(Rng(43))
end

# @id TEST-RNG-002 @verifies REQ-RNG-002
@testset "TEST-RNG-002 zero seed substituted" begin
    r = Rng(0)
    @test r.state == 0x9E3779B97F4A7C15
    @test next_u64!(r) == 0x0d83b3e29a21487a
    @test next_u64!(r) == 0x54c44c79f1fe9d67
    @test all(r.state != 0 for _ in 1:1000 if next_u64!(r) isa UInt64)
end

# @id TEST-RNG-003 @verifies REQ-RNG-003
@testset "TEST-RNG-003 rand_f64 range and bits" begin
    r = Rng(7); c = copy(r)
    for _ in 1:5000
        x = rand_f64!(r)
        @test 0.0 <= x < 1.0
    end
    @test rand_f64!(Rng(1)) == Float64(0x47e4ce4b896cdd1d >> 11) * 2.0^-53
    @test c.state != r.state
end

# @id TEST-RNG-004 @verifies REQ-RNG-004
@testset "TEST-RNG-004 rand_int rejection sampling" begin
    r = Rng(3)
    @test all(rand_int!(r, 1) == 1 for _ in 1:20)
    xs = [rand_int!(r, 3) for _ in 1:30000]
    @test minimum(xs) == 1 && maximum(xs) == 3
    for k in 1:3
        @test abs(count(==(k), xs) / 30000 - 1 / 3) < 0.02
    end
    @test_throws ArgumentError rand_int!(r, 0)
    @test_throws ArgumentError rand_int!(r, -5)
    big = 3 << 61
    ys = [rand_int!(r, big) for _ in 1:6000]
    @test all(1 .<= ys .<= big)
    frac = count(y -> y <= big ÷ 3 * 2, ys) / 6000
    @test 0.60 < frac < 0.73
end

# @id TEST-RNG-005 @verifies REQ-RNG-005
@testset "TEST-RNG-005 randn Box-Muller with spare" begin
    r = Rng(11)
    xs = [randn!(r) for _ in 1:20000]
    m = sum(xs) / length(xs)
    v = sum((x - m)^2 for x in xs) / length(xs)
    @test abs(m) < 0.05
    @test abs(v - 1) < 0.05
    a = Rng(5); b = Rng(5)
    randn!(a); randn!(a)
    rand_f64!(b); rand_f64!(b)
    @test a.state == b.state
    @test a.spare === nothing
    c = Rng(5)
    randn!(c)
    @test c.spare !== nothing
end

# @id TEST-RNG-006 @verifies REQ-RNG-006
@testset "TEST-RNG-006 shuffle is Fisher-Yates" begin
    v = collect(1:50)
    shuffle!(Rng(9), v)
    @test sort(v) == collect(1:50)
    @test v != collect(1:50)
    seen = Set{Vector{Int}}()
    for s in 1:300
        w = [1, 2, 3]
        shuffle!(Rng(s), w)
        push!(seen, w)
    end
    @test length(seen) == 6
    @test shuffle!(Rng(1), Int[]) == Int[]
    @test shuffle!(Rng(1), [7]) == [7]
end

# @id TEST-RNG-007 @verifies REQ-RNG-007
@testset "TEST-RNG-007 split" begin
    p = Rng(21); ref = copy(p)
    ch = split(p)
    next_u64!(ref)
    @test p.state == ref.state
    @test next_u64!(ch) != next_u64!(copy(p))
    ch2 = split(Rng(21))
    ch3 = split(Rng(21))
    @test [next_u64!(ch2) for _ in 1:5] == [next_u64!(ch3) for _ in 1:5]
end

# @id TEST-RNG-008 @verifies REQ-RNG-008
@testset "TEST-RNG-008 copy independence" begin
    a = Rng(99); randn!(a)
    b = copy(a)
    @test b.state == a.state && b.spare == a.spare
    xs = [randn!(a) for _ in 1:5]
    @test [randn!(b) for _ in 1:5] == xs
    next_u64!(a)
    @test a.state != b.state
end

end
