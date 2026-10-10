using Test
include("../src/sparse.jl")
include("../src/result.jl")
include("../src/gradient.jl")
using .SparseOps
using .Gradient

const QA = from_triplets(2, 2, [1, 2], [1, 2], [2.0, 4.0])
const QB = [2.0, 4.0]
const Q = quadratic_problem(QA, QB)

# @id TEST-GRAD-001 @verifies REQ-GRAD-001
@testset "TEST-GRAD-001 converges on quadratic" begin
    f, g = Q
    r = gradient_descent(f, g, [5.0, -5.0]; tol=1e-8)
    @test r.status == :converged
    @test r.x ≈ [1.0, 1.0] atol = 1e-6
    @test sqrt(sum(abs2, g(r.x))) < 1e-8
end

# @id TEST-GRAD-002 @verifies REQ-GRAD-002
@testset "TEST-GRAD-002 monotone f history" begin
    f, g = Q
    r = gradient_descent(f, g, [5.0, -5.0])
    h = r.history
    @test length(h) >= 2
    @test all(h[i+1] <= h[i] for i in 1:length(h)-1)
end

# @id TEST-GRAD-003 @verifies REQ-GRAD-003
@testset "TEST-GRAD-003 already at optimum" begin
    f, g = Q
    r = gradient_descent(f, g, [1.0, 1.0])
    @test r.status == :converged
    @test r.iterations == 0
end

# @id TEST-GRAD-004 @verifies REQ-GRAD-004
@testset "TEST-GRAD-004 max_iter" begin
    f, g = Q
    r = gradient_descent(f, g, [100.0, -100.0]; tol=1e-14, max_iter=1)
    @test r.status == :max_iter
    @test r.iterations == 1
end

# @id TEST-GRAD-005 @verifies REQ-GRAD-005
@testset "TEST-GRAD-005 non-finite" begin
    @test_throws DomainError gradient_descent(x -> sum(x), x -> [NaN], [1.0])
    @test_throws DomainError gradient_descent(x -> NaN, x -> [1.0], [1.0])
end

# @id TEST-GRAD-006 @verifies REQ-GRAD-006
@testset "TEST-GRAD-006 invalid arguments" begin
    f, g = Q
    @test_throws ArgumentError gradient_descent(f, g, [1.0, 1.0]; tol=-1.0)
    @test_throws ArgumentError gradient_descent(f, g, [1.0, 1.0]; max_iter=0)
end

# @id TEST-GRAD-007 @verifies REQ-GRAD-007
@testset "TEST-GRAD-007 quadratic_problem" begin
    f, g = Q
    @test f([1.0, 1.0]) ≈ 0.5 * (2.0 + 4.0) - 6.0
    @test g([2.0, 3.0]) ≈ [2.0, 8.0]
end

# @id TEST-GRAD-008 @verifies REQ-GRAD-008
@testset "TEST-GRAD-008 line search failure" begin
    r = gradient_descent(x -> x[1]^2, x -> [-1e10 * x[1]], [1.0])
    @test r.status == :line_search_failed
end

# @id TEST-GRAD-009 @verifies REQ-GRAD-009
@testset "TEST-GRAD-009 zero-progress step is a line search failure" begin
    r = gradient_descent(x -> sum(abs2, x), x -> -2 .* x, [1.0]; max_iter=100)
    @test r.status == :line_search_failed
end
