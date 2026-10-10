using Test
include("../src/sparse.jl")
include("../src/lu.jl")
using .SparseOps
using .LU

const A3 = from_triplets(3, 3, [1,1,2,2,2,3,3], [1,2,1,2,3,2,3], [2.0,1.0,4.0,3.0,1.0,1.0,5.0])

# @id TEST-LU-001 @verifies REQ-LU-001
@testset "TEST-LU-001 factor uses partial pivoting" begin
    F = lu_factor(from_triplets(2, 2, [1,1,2,2], [1,2,1,2], [1.0,2.0,3.0,4.0]))
    @test F.perm == [2, 1]
end

# @id TEST-LU-002 @verifies REQ-LU-002
@testset "TEST-LU-002 solve" begin
    b = [1.0, 2.0, 3.0]
    x = lu_solve(lu_factor(A3), b)
    @test matvec(A3, x) ≈ b
end

# @id TEST-LU-003 @verifies REQ-LU-003
@testset "TEST-LU-003 singular" begin
    S = from_triplets(2, 2, [1,1,2,2], [1,2,1,2], [1.0,2.0,2.0,4.0])
    @test_throws SingularMatrixError lu_factor(S)
end

# @id TEST-LU-004 @verifies REQ-LU-004
@testset "TEST-LU-004 non square" begin
    @test_throws DimensionMismatch lu_factor(from_triplets(2, 3, [1], [1], [1.0]))
end

# @id TEST-LU-005 @verifies REQ-LU-005
@testset "TEST-LU-005 rhs mismatch" begin
    @test_throws DimensionMismatch lu_solve(lu_factor(A3), [1.0, 2.0])
end

# @id TEST-LU-006 @verifies REQ-LU-006
@testset "TEST-LU-006 determinant" begin
    @test lu_det(lu_factor(A3)) ≈ 2.0*(15.0-1.0) - 1.0*(20.0-0.0)
    @test lu_det(lu_factor(from_triplets(2, 2, [1,2], [2,1], [1.0,1.0]))) ≈ -1.0
end

# @id TEST-LU-007 @verifies REQ-LU-007
@testset "TEST-LU-007 solve_checked" begin
    @test solve_checked(A3, [1.0,2.0,3.0]; tol=1e-9) ≈ lu_solve(lu_factor(A3), [1.0,2.0,3.0])
    @test_throws ConvergenceError solve_checked(A3, [1.0, 2.0, 3.0]; tol=-1.0)
end
