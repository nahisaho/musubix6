using Test
include("../src/sparse.jl")
using .SparseOps

# @id TEST-SPARSE-001 @verifies REQ-SPARSE-001
@testset "TEST-SPARSE-001 from_triplets sums duplicates" begin
    A = from_triplets(2, 2, [1, 1, 2], [1, 1, 2], [1.0, 2.0, 5.0])
    @test to_dense(A) == [3.0 0.0; 0.0 5.0]
end

# @id TEST-SPARSE-002 @verifies REQ-SPARSE-002
@testset "TEST-SPARSE-002 out of bounds index" begin
    @test_throws BoundsError from_triplets(2, 2, [3], [1], [1.0])
    @test_throws BoundsError from_triplets(2, 2, [1], [0], [1.0])
end

# @id TEST-SPARSE-003 @verifies REQ-SPARSE-003
@testset "TEST-SPARSE-003 nnz drops explicit zeros" begin
    A = from_triplets(2, 2, [1, 2, 2], [1, 1, 2], [1.0, 0.0, 4.0])
    @test nnz(A) == 2
end

# @id TEST-SPARSE-004 @verifies REQ-SPARSE-004
@testset "TEST-SPARSE-004 matvec" begin
    A = from_triplets(2, 3, [1, 1, 2], [1, 3, 2], [2.0, 1.0, 3.0])
    @test matvec(A, [1.0, 2.0, 3.0]) == [5.0, 6.0]
end

# @id TEST-SPARSE-005 @verifies REQ-SPARSE-005
@testset "TEST-SPARSE-005 matvec dimension mismatch" begin
    A = from_triplets(2, 3, [1], [1], [1.0])
    @test_throws DimensionMismatch matvec(A, [1.0, 2.0])
end

# @id TEST-SPARSE-006 @verifies REQ-SPARSE-006
@testset "TEST-SPARSE-006 transpose" begin
    A = from_triplets(2, 3, [1, 1, 2], [1, 3, 2], [2.0, 1.0, 3.0])
    @test to_dense(transpose_csr(A)) == permutedims(to_dense(A))
end

# @id TEST-SPARSE-007 @verifies REQ-SPARSE-007
@testset "TEST-SPARSE-007 add" begin
    A = from_triplets(2, 2, [1, 2], [1, 2], [1.0, 2.0])
    B = from_triplets(2, 2, [1, 2], [2, 2], [3.0, 4.0])
    @test to_dense(add(A, B)) == [1.0 3.0; 0.0 6.0]
    C = from_triplets(3, 3, [1], [1], [1.0])
    @test_throws DimensionMismatch add(A, C)
end

# @id TEST-SPARSE-008 @verifies REQ-SPARSE-008
@testset "TEST-SPARSE-008 to_dense" begin
    A = from_triplets(2, 2, [2], [1], [7.0])
    @test to_dense(A) == [0.0 0.0; 7.0 0.0]
    @test size(to_dense(A)) == (2, 2)
end
