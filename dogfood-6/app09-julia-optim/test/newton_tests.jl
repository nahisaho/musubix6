using Test
include("../src/sparse.jl")
include("../src/lu.jl")
include("../src/result.jl")
include("../src/newton.jl")
using .SparseOps
using .Newton

const F2(x) = [x[1]^2 + x[2]^2 - 4.0, x[1] - x[2]]
const J2(x) = from_triplets(2, 2, [1, 1, 2, 2], [1, 2, 1, 2], [2x[1], 2x[2], 1.0, -1.0])
const FL(x) = [2x[1] + x[2] - 3.0, x[1] + 3x[2] - 5.0]
const JL(x) = from_triplets(2, 2, [1, 1, 2, 2], [1, 2, 1, 2], [2.0, 1.0, 1.0, 3.0])

# @id TEST-NEWTON-001 @verifies REQ-NEWTON-001
@testset "TEST-NEWTON-001 converges to root" begin
    r = newton(F2, J2, [1.0, 2.0]; tol=1e-10)
    @test r.status == :converged
    @test r.x ≈ [sqrt(2.0), sqrt(2.0)] atol = 1e-8
    @test sqrt(sum(abs2, F2(r.x))) < 1e-10
end

# @id TEST-NEWTON-002 @verifies REQ-NEWTON-002
@testset "TEST-NEWTON-002 result fields" begin
    r = newton(F2, J2, [1.0, 2.0])
    @test r.iterations >= 1
    @test r.residual < 1e-8
    @test r.status in (:converged, :singular, :max_iter, :stalled)
end

# @id TEST-NEWTON-003 @verifies REQ-NEWTON-003
@testset "TEST-NEWTON-003 linear system solved in one LU step" begin
    r = newton(FL, JL, [0.0, 0.0])
    @test r.iterations == 1
    @test r.x ≈ [0.8, 1.4]
end

# @id TEST-NEWTON-004 @verifies REQ-NEWTON-004
@testset "TEST-NEWTON-004 singular jacobian" begin
    r = newton(x -> [x[1]^2, 0.0 + x[1]^2], x -> from_triplets(2, 2, [1], [1], [0.0]), [1.0, 1.0])
    @test r.status == :singular
end

# @id TEST-NEWTON-005 @verifies REQ-NEWTON-005
@testset "TEST-NEWTON-005 max_iter" begin
    r = newton(F2, J2, [10.0, 1.0]; tol=1e-14, max_iter=1)
    @test r.status == :max_iter
    @test r.iterations == 1
end

# @id TEST-NEWTON-006 @verifies REQ-NEWTON-006
@testset "TEST-NEWTON-006 non-finite residual" begin
    @test_throws DomainError newton(x -> [NaN, 0.0], JL, [0.0, 0.0])
    @test_throws DomainError newton(x -> [Inf, 0.0], JL, [0.0, 0.0])
end

# @id TEST-NEWTON-007 @verifies REQ-NEWTON-007
@testset "TEST-NEWTON-007 monotone residual history" begin
    r = newton(F2, J2, [10.0, -3.0]; tol=1e-12)
    h = r.history
    @test length(h) >= 2
    @test all(h[i+1] <= h[i] for i in 1:length(h)-1)
end

# @id TEST-NEWTON-008 @verifies REQ-NEWTON-008
@testset "TEST-NEWTON-008 invalid arguments" begin
    @test_throws ArgumentError newton(F2, J2, [1.0, 1.0]; tol=0.0)
    @test_throws ArgumentError newton(F2, J2, [1.0, 1.0]; max_iter=0)
end
