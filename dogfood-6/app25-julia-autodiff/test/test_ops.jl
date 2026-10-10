using Test
include("../src/Tensors.jl")
include("../src/Tape.jl")
include("../src/Ops.jl")
using .Tensors
using .TapeMod
using .Ops

V(t, d, shape; rg=true) = leaf(t, Tensor(Float64.(d), shape); requires_grad=rg)
vec3(t, d; rg=true) = V(t, d, (length(d),); rg=rg)

@testset "ops" begin

# @id TEST-OPS-001 @verifies REQ-OPS-001
@testset "TEST-OPS-001 add sub mul" begin
    t = Tape(); a = vec3(t, [1, 2, 3]); b = vec3(t, [4, 5, 6])
    s = add_v(a, b); d = sub_v(a, b); m = mul_v(a, b)
    @test s.value.data == [5.0, 7, 9]
    @test d.value.data == [-3.0, -3, -3]
    @test m.value.data == [4.0, 10, 18]
    backward!(t, sum_v(add_v(add_v(s, d), m)))
    @test a.grad.data == [1 + 1 + 4.0, 1 + 1 + 5.0, 1 + 1 + 6.0]
    @test b.grad.data == [1 - 1 + 1.0, 1 - 1 + 2.0, 1 - 1 + 3.0]
end

# @id TEST-OPS-002 @verifies REQ-OPS-002
@testset "TEST-OPS-002 broadcasting gradients reduce to parent shape" begin
    t = Tape()
    a = V(t, 1:6, (2, 3)); row = V(t, [10, 20, 30], (1, 3)); col = V(t, [100, 200], (2, 1)); sc = V(t, [2], ())
    backward!(t, sum_v(mul_v(add_v(a, row), col)))
    @test size_t(row.grad) == (1, 3) && size_t(col.grad) == (2, 1)
    @test a.grad.data == [100.0, 200, 100, 200, 100, 200]
    @test row.grad.data == [300.0, 300, 300]
    @test col.grad.data == [(1 + 10) + (3 + 20) + (5 + 30.0), (2 + 10) + (4 + 20) + (6 + 30.0)]
    t2 = Tape()
    x = V(t2, 1:4, (2, 2)); s = V(t2, [3], ())
    backward!(t2, sum_v(mul_v(x, s)))
    @test size_t(s.grad) == () && s.grad.data == [10.0]
    @test x.grad.data == fill(3.0, 4)
    t3 = Tape(); p = vec3(t3, [1, 2]); q = V(t3, [1, 2, 3, 4, 5, 6], (3, 2))
    backward!(t3, sum_v(add_v(q, p)))
    @test size_t(p.grad) == (2,) && p.grad.data == [3.0, 3.0]
end

# @id TEST-OPS-003 @verifies REQ-OPS-003
@testset "TEST-OPS-003 matmul gradients" begin
    t = Tape()
    A = V(t, 1:6, (2, 3)); B = V(t, 1:6, (3, 2))
    C = matmul_v(A, B)
    @test C.value.data == [22.0, 28, 49, 64]
    backward!(t, sum_v(C))
    @test A.grad.data == matmul_t(Tensor(ones(4), (2, 2)), transpose_t(B.value)).data
    @test B.grad.data == matmul_t(transpose_t(A.value), Tensor(ones(4), (2, 2))).data
    @test_throws DimensionMismatch matmul_v(A, A)
end

# @id TEST-OPS-004 @verifies REQ-OPS-004
@testset "TEST-OPS-004 relu" begin
    t = Tape(); x = vec3(t, [-1, 0, 2, 3.5])
    y = relu_v(x)
    @test y.value.data == [0.0, 0, 2, 3.5]
    backward!(t, sum_v(y))
    @test x.grad.data == [0.0, 0, 1, 1]
end

# @id TEST-OPS-005 @verifies REQ-OPS-005
@testset "TEST-OPS-005 tanh sigmoid exp" begin
    t = Tape(); x = vec3(t, [0.5, -0.3])
    backward!(t, sum_v(add_v(add_v(tanh_v(x), sigmoid_v(x)), exp_v(x))); retain=true)
    th = tanh.([0.5, -0.3]); sg = 1 ./ (1 .+ exp.(-[0.5, -0.3]))
    @test x.grad.data ≈ (1 .- th .^ 2) .+ sg .* (1 .- sg) .+ exp.([0.5, -0.3])
    t2 = Tape(); z = vec3(t2, [-1000, 0, 1000])
    s = sigmoid_v(z)
    @test s.value.data == [0.0, 0.5, 1.0]
    backward!(t2, sum_v(s))
    @test all(isfinite, z.grad.data) && all(>=(0), z.grad.data)
    @test z.grad.data[2] == 0.25
end

# @id TEST-OPS-006 @verifies REQ-OPS-006
@testset "TEST-OPS-006 log" begin
    t = Tape(); x = vec3(t, [2, 4])
    backward!(t, sum_v(log_v(x)))
    @test x.grad.data == [0.5, 0.25]
    t2 = Tape()
    @test_throws DomainError log_v(vec3(t2, [1, 0]))
    @test_throws DomainError log_v(vec3(t2, [-1, 3]))
end

# @id TEST-OPS-007 @verifies REQ-OPS-007
@testset "TEST-OPS-007 sum and mean with dims" begin
    t = Tape(); x = V(t, 1:6, (2, 3)); w = vec3(t, [1, 2, 3])
    r = sum_v(x; dims=1)
    @test size_t(r.value) == (3,) && r.value.data == [3.0, 7, 11]
    backward!(t, sum_v(mul_v(r, w)))
    @test x.grad.data == [1.0, 1, 2, 2, 3, 3]
    t2 = Tape(); y = V(t2, 1:6, (2, 3))
    m = mean_v(y; dims=2, keepdims=true)
    @test size_t(m.value) == (2, 1) && m.value.data == [3.0, 4.0]
    backward!(t2, sum_v(m))
    @test all(g -> g ≈ 1 / 3, y.grad.data)
    t3 = Tape(); z = V(t3, 1:6, (2, 3))
    backward!(t3, mean_v(z))
    @test all(g -> g ≈ 1 / 6, z.grad.data)
    @test_throws ArgumentError sum_v(z; dims=3)
    @test size_t(sum_v(V(Tape(), 1:6, (2, 3)); dims=(1, 2)).value) == ()
end

# @id TEST-OPS-008 @verifies REQ-OPS-008
@testset "TEST-OPS-008 pow" begin
    t = Tape(); x = vec3(t, [2, -3])
    backward!(t, sum_v(pow_v(x, 3)))
    @test x.grad.data == [12.0, 27.0]
    t2 = Tape(); y = vec3(t2, [2.0, 0.0])
    p0 = pow_v(y, 0)
    @test p0.value.data == [1.0, 1.0]
    backward!(t2, sum_v(p0))
    @test y.grad.data == [0.0, 0.0]
    t3 = Tape(); z = vec3(t3, [2.0])
    backward!(t3, sum_v(pow_v(z, -1)))
    @test z.grad.data == [-0.25]
end

# @id TEST-OPS-009 @verifies REQ-OPS-009
@testset "TEST-OPS-009 same var twice" begin
    t = Tape(); x = vec3(t, [3, 4])
    backward!(t, sum_v(mul_v(x, x)))
    @test x.grad.data == [6.0, 8.0]
end

# @id TEST-OPS-010 @verifies REQ-OPS-010
@testset "TEST-OPS-010 constants and no_grad" begin
    t = Tape(); c1 = vec3(t, [1, 2]; rg=false); c2 = vec3(t, [3, 4]; rg=false)
    r = mul_v(c1, c2)
    @test !r.requires_grad && r.backfn === nothing
    x = vec3(t, [5, 6])
    d = detach(x)
    y = mul_v(x, d)
    @test y.requires_grad
    backward!(t, sum_v(y))
    @test x.grad.data == [5.0, 6.0]
    t2 = Tape(); a = vec3(t2, [1, 2])
    n = length(t2.nodes)
    q = no_grad(t2) do
        mul_v(a, a)
    end
    @test !q.requires_grad && q.backfn === nothing && length(t2.nodes) == n
    z = add_v(detach(a), detach(a))
    @test !z.requires_grad && tape_of(z) === nothing
    @test (mul_v(a, 2.0)).value.data == [2.0, 4.0]
    t3 = Tape(); u = vec3(t3, [1.0]); reset!(t3)
    @test_throws ArgumentError add_v(u, u)
    @test_throws ArgumentError add_v(a, vec3(Tape(), [1, 2]))
end

# @id TEST-OPS-011 @verifies REQ-OPS-011
@testset "TEST-OPS-011 operators" begin
    t = Tape(); a = vec3(t, [1, 2]); b = vec3(t, [3, 5])
    @test (a + b).value.data == [4.0, 7]
    @test (a - b).value.data == [-2.0, -3]
    @test (a * b).value.data == [3.0, 10]
    @test (b / a).value.data == [3.0, 2.5]
    @test (-a).value.data == [-1.0, -2]
    @test (a + 1).value.data == [2.0, 3]
    @test (2 * a).value.data == [2.0, 4]
    @test (1 - a).value.data == [0.0, -1]
    @test (a / 2).value.data == [0.5, 1]
    @test (6 / b).value.data ≈ [2.0, 1.2]
    A = V(t, 1:4, (2, 2)); B = V(t, [1, 0, 0, 1], (2, 2))
    @test (A * B).value.data == A.value.data
    @test (A * V(t, [2, 0, 0, 2], (2, 2))).value.data == [2.0, 4, 6, 8]
    S = V(t, [3], ())
    @test (S * A).value.data == [3.0, 6, 9, 12]
    backward!(t, sum_v(-(a * 2 + 1) / b))
    @test a.grad.data == [-2 / 3, -2 / 5]
end

# @id TEST-OPS-012 @verifies REQ-OPS-012
@testset "TEST-OPS-012 div" begin
    t = Tape(); a = vec3(t, [6, 1]); b = vec3(t, [3, 4])
    backward!(t, sum_v(div_v(a, b)))
    @test a.grad.data == [1 / 3, 1 / 4]
    @test b.grad.data ≈ [-6 / 9, -1 / 16]
    t2 = Tape()
    @test_throws DomainError div_v(vec3(t2, [1, 2]), vec3(t2, [1, 0]))
end

end
