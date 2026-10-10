using Test
include("../src/Tensors.jl")
include("../src/Tape.jl")
include("../src/Ops.jl")
include("../src/GradCheck.jl")
using .Tensors
using .TapeMod
using .Ops
using .GradCheck

T(d, shape=(length(d),)) = Tensor(Float64.(d), shape)
bad_square(a) = record!(tape_of(a), map_t(v -> v^2, a.value), [a], G -> [mul_t(G, map_t(v -> 3v, a.value))])

@testset "gradcheck" begin

# @id TEST-GRADCHECK-001 @verifies REQ-GRADCHECK-001
@testset "TEST-GRADCHECK-001 numeric_grad central difference" begin
    x = T([1, 2, 3]); seen = Vector{Vector{Float64}}()
    g = numeric_grad(t -> (push!(seen, copy(t.data)); sum(abs2, t.data)), x)
    @test size_t(g) == (3,)
    @test all(isapprox.(g.data, [2.0, 4, 6]; atol=1e-6))
    @test x.data == [1.0, 2, 3]
    @test length(seen) == 6 && seen[1] != x.data
    m = T(1:6, (2, 3))
    gm = numeric_grad(t -> sum(t.data .^ 3), m; eps=1e-5)
    @test size_t(gm) == (2, 3)
    @test all(isapprox.(gm.data, 3 .* (1.0:6.0) .^ 2; rtol=1e-6))
    @test m.data == collect(1.0:6.0)
end

# @id TEST-GRADCHECK-002 @verifies REQ-GRADCHECK-002
@testset "TEST-GRADCHECK-002 eps validation" begin
    @test_throws ArgumentError numeric_grad(t -> 0.0, T([1]); eps=0.0)
    @test_throws ArgumentError numeric_grad(t -> 0.0, T([1]); eps=-1e-3)
    @test_throws ArgumentError gradcheck(a -> sum_v(a), [T([1])]; eps=0)
end

# @id TEST-GRADCHECK-003 @verifies REQ-GRADCHECK-003
@testset "TEST-GRADCHECK-003 gradcheck result" begin
    r = gradcheck((a, b) -> sum_v(mul_v(tanh_v(a), b)), [T([0.3, -0.7]), T([1.5, 2.0])])
    @test r isa GradCheckResult
    @test r.ok
    @test r.max_abs_err < 1e-6 && r.max_rel_err < 1e-4
    @test r.worst isa Tuple{Int,Int}
    @test isempty(r.unused)
end

# @id TEST-GRADCHECK-004 @verifies REQ-GRADCHECK-004
@testset "TEST-GRADCHECK-004 tolerance rule" begin
    f = a -> sum_v(exp_v(a))
    xs = [T([0.5, 1.0, -2.0])]
    @test gradcheck(f, xs).ok
    @test !gradcheck(f, xs; atol=0.0, rtol=0.0).ok
    @test gradcheck(f, xs; atol=1e-3, rtol=0.0).ok
end

# @id TEST-GRADCHECK-005 @verifies REQ-GRADCHECK-005
@testset "TEST-GRADCHECK-005 detects wrong backward" begin
    r = gradcheck(a -> sum_v(bad_square(a)), [T([1, 2, 3])])
    @test !r.ok
    @test r.worst == (1, 3)
    @test r.max_abs_err ≈ 3.0 atol = 1e-4
    r2 = gradcheck((a, b) -> sum_v(add_v(a, bad_square(b))), [T([1.0]), T([1, 2])])
    @test r2.worst == (2, 2)
end

# @id TEST-GRADCHECK-006 @verifies REQ-GRADCHECK-006
@testset "TEST-GRADCHECK-006 scalar output required" begin
    @test_throws ArgumentError gradcheck(a -> mul_v(a, a), [T([1, 2])])
    @test_throws ArgumentError gradcheck(a -> 1.0, [T([1, 2])])
end

# @id TEST-GRADCHECK-007 @verifies REQ-GRADCHECK-007
@testset "TEST-GRADCHECK-007 unused inputs" begin
    r = gradcheck((a, b) -> sum_v(mul_v(a, a)), [T([1, 2]), T([5, 6, 7])])
    @test r.unused == [2]
    @test r.ok
end

# @id TEST-GRADCHECK-008 @verifies REQ-GRADCHECK-008
@testset "TEST-GRADCHECK-008 format_result" begin
    ok = gradcheck(a -> sum_v(mul_v(a, a)), [T([1, 2])])
    s = format_result(ok)
    @test startswith(s, "PASS") && occursin("max_abs_err", s) && !occursin('\n', s)
    bad = gradcheck(a -> sum_v(bad_square(a)), [T([1, 2, 3])])
    s2 = format_result(bad)
    @test startswith(s2, "FAIL") && occursin("input 1 element 3", s2)
end

end
