using Test
include("../src/Tensors.jl")
using .Tensors

@testset "tensor" begin

# @id TEST-TENSOR-001 @verifies REQ-TENSOR-001
@testset "TEST-TENSOR-001 construct copies data" begin
    d = [1.0, 2, 3, 4, 5, 6]
    t = Tensor(d, (2, 3))
    d[1] = 99.0
    @test t.data[1] == 1.0
    @test numel(t) == 6
    @test size_t(t) == (2, 3)
end

# @id TEST-TENSOR-002 @verifies REQ-TENSOR-002
@testset "TEST-TENSOR-002 invalid construction" begin
    @test_throws DimensionMismatch Tensor([1.0, 2.0, 3.0], (2, 2))
    @test_throws ArgumentError Tensor(Float64[], (0, 3))
    @test_throws ArgumentError Tensor([1.0], (-1, -1))
end

# @id TEST-TENSOR-003 @verifies REQ-TENSOR-003
@testset "TEST-TENSOR-003 strides" begin
    @test strides_t((2, 3, 4)) == (1, 2, 6)
    @test strides_t((5,)) == (1,)
    @test strides_t(()) == ()
end

# @id TEST-TENSOR-004 @verifies REQ-TENSOR-004
@testset "TEST-TENSOR-004 indexing" begin
    t = Tensor(collect(1.0:6.0), (2, 3))
    @test t[1, 1] == 1.0
    @test t[2, 1] == 2.0
    @test t[1, 3] == 5.0
    @test t[2, 3] == 6.0
    @test_throws BoundsError t[3, 1]
    @test_throws BoundsError t[1, 0]
    @test_throws BoundsError t[1, 1, 1]
end

# @id TEST-TENSOR-005 @verifies REQ-TENSOR-005
@testset "TEST-TENSOR-005 reshape" begin
    t = Tensor(collect(1.0:6.0), (2, 3))
    r = reshape_t(t, (3, -1))
    @test size_t(r) == (3, 2)
    @test r.data == t.data
    r.data[1] = -1.0
    @test t.data[1] == 1.0
    @test_throws DimensionMismatch reshape_t(t, (4, -1))
    @test_throws DimensionMismatch reshape_t(t, (5, 2))
    @test_throws ArgumentError reshape_t(t, (-1, -1))
end

# @id TEST-TENSOR-006 @verifies REQ-TENSOR-006
@testset "TEST-TENSOR-006 transpose" begin
    t = Tensor(collect(1.0:6.0), (2, 3))
    tt = transpose_t(t)
    @test size_t(tt) == (3, 2)
    @test tt[3, 2] == t[2, 3]
    @test tt[1, 2] == t[2, 1]
    @test_throws ArgumentError transpose_t(Tensor([1.0, 2.0], (2,)))
end

# @id TEST-TENSOR-007 @verifies REQ-TENSOR-007
@testset "TEST-TENSOR-007 broadcast_shape" begin
    @test broadcast_shape((3, 1), (1, 4)) == (3, 4)
    @test broadcast_shape((4,), (3, 4)) == (3, 4)
    @test broadcast_shape((2, 3), (2, 3)) == (2, 3)
    @test broadcast_shape((), (2,)) == (2,)
    @test_throws DimensionMismatch broadcast_shape((2, 3), (3, 2))
    @test_throws DimensionMismatch broadcast_shape((2,), (3,))
end

# @id TEST-TENSOR-008 @verifies REQ-TENSOR-008
@testset "TEST-TENSOR-008 broadcasting elementwise" begin
    a = Tensor(collect(1.0:6.0), (2, 3))
    row = Tensor([10.0, 20.0, 30.0], (1, 3))
    col = Tensor([100.0, 200.0], (2, 1))
    s = add_t(a, row)
    @test s.data == [11.0, 12, 23, 24, 35, 36]
    @test mul_t(a, col).data == [100.0, 400, 300, 800, 500, 1200]
    @test sub_t(a, a).data == zeros(6)
    @test size_t(add_t(row, col)) == (2, 3)
    @test add_t(row, col)[2, 3] == 230.0
    @test_throws DimensionMismatch add_t(a, Tensor([1.0, 2.0], (2,)))
end

# @id TEST-TENSOR-009 @verifies REQ-TENSOR-009
@testset "TEST-TENSOR-009 matmul" begin
    a = Tensor(collect(1.0:6.0), (2, 3))
    b = Tensor(collect(1.0:6.0), (3, 2))
    c = matmul_t(a, b)
    @test size_t(c) == (2, 2)
    @test c.data == [22.0, 28.0, 49.0, 64.0]
    @test_throws DimensionMismatch matmul_t(a, a)
end

# @id TEST-TENSOR-010 @verifies REQ-TENSOR-010
@testset "TEST-TENSOR-010 sum_t axes" begin
    a = Tensor(collect(1.0:6.0), (2, 3))
    @test sum_t(a).data == [21.0]
    @test size_t(sum_t(a)) == ()
    @test sum_t(a; dims=1).data == [3.0, 7.0, 11.0]
    @test size_t(sum_t(a; dims=1)) == (3,)
    @test size_t(sum_t(a; dims=1, keepdims=true)) == (1, 3)
    @test sum_t(a; dims=2, keepdims=true).data == [9.0, 12.0]
    @test sum_t(a; dims=(1, 2)).data == [21.0]
    @test_throws ArgumentError sum_t(a; dims=3)
end

# @id TEST-TENSOR-011 @verifies REQ-TENSOR-011
@testset "TEST-TENSOR-011 sum_to_shape" begin
    a = Tensor(collect(1.0:6.0), (2, 3))
    @test sum_to_shape(a, (1, 3)).data == [3.0, 7.0, 11.0]
    @test sum_to_shape(a, (2, 1)).data == [9.0, 12.0]
    @test sum_to_shape(a, (3,)).data == [3.0, 7.0, 11.0]
    @test sum_to_shape(a, ()).data == [21.0]
    @test sum_to_shape(a, (2, 3)).data == a.data
    @test_throws DimensionMismatch sum_to_shape(a, (4,))
end

# @id TEST-TENSOR-012 @verifies REQ-TENSOR-012
@testset "TEST-TENSOR-012 map_t" begin
    a = Tensor([1.0, 4.0, 9.0], (3,))
    b = map_t(sqrt, a)
    @test b.data == [1.0, 2.0, 3.0]
    @test a.data == [1.0, 4.0, 9.0]
    @test size_t(b) == (3,)
end

end
