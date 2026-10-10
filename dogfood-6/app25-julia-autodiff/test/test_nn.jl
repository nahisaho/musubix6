using Test
include("../src/Tensors.jl")
include("../src/Rng.jl")
include("../src/Tape.jl")
include("../src/Ops.jl")
include("../src/GradCheck.jl")
include("../src/NN.jl")
using .Tensors
using .RngMod
using .TapeMod
using .Ops
using .GradCheck
using .NN

@testset "nn" begin

# @id TEST-NN-001 @verifies REQ-NN-001
@testset "TEST-NN-001 xavier init" begin
    l = Linear(4, 6, Rng(1))
    lim = sqrt(6 / 10)
    @test l.W.shape == (4, 6) && l.b.shape == (1, 6)
    @test all(abs.(l.W.data) .<= lim)
    @test maximum(abs.(l.W.data)) > 0.5 * lim
    @test all(l.b.data .== 0.0)
    @test Linear(4, 6, Rng(1)).W.data == l.W.data
    @test Linear(4, 6, Rng(2)).W.data != l.W.data
    @test_throws ArgumentError Linear(0, 3, Rng(1))
end

# @id TEST-NN-002 @verifies REQ-NN-002
@testset "TEST-NN-002 forward shapes and activation placement" begin
    m = MLP([3, 5, 2], Rng(4))
    t = Tape(); vs = bind!(m, t)
    x = Tensor(collect(range(-1, 1; length=12)), (4, 3))
    y = mlp_forward(m, vs, x)
    @test y.value.shape == (4, 2)
    # manual reference: tanh hidden, linear output
    W1, b1, W2, b2 = parameters(m)
    h = map_t(tanh, add_t(matmul_t(x, W1), b1))
    ref = add_t(matmul_t(h, W2), b2)
    @test all(isapprox.(y.value.data, ref.data; atol=1e-12))
    m2 = MLP([3, 5, 2], Rng(4); activation=:relu)
    t2 = Tape()
    y2 = mlp_forward(m2, bind!(m2, t2), x)
    h2 = map_t(v -> max(v, 0.0), add_t(matmul_t(x, parameters(m2)[1]), parameters(m2)[2]))
    @test all(isapprox.(y2.value.data, add_t(matmul_t(h2, parameters(m2)[3]), parameters(m2)[4]).data; atol=1e-12))
    @test_throws DimensionMismatch mlp_forward(m, vs, Tensor(zeros(4 * 2), (4, 2)))
end

# @id TEST-NN-003 @verifies REQ-NN-003
@testset "TEST-NN-003 mlp construction and parameter order" begin
    @test_throws ArgumentError MLP([3], Rng(1))
    @test_throws ArgumentError MLP(Int[], Rng(1))
    @test_throws ArgumentError MLP([3, 0, 2], Rng(1))
    @test_throws ArgumentError MLP([3, -1], Rng(1))
    @test_throws ArgumentError MLP([3, 2], Rng(1); activation=:swish)
    m = MLP([2, 4, 3, 1], Rng(1))
    ps = parameters(m)
    @test length(ps) == 6
    @test [p.shape for p in ps] == [(2, 4), (1, 4), (4, 3), (1, 3), (3, 1), (1, 1)]
    @test ps[1] === m.layers[1].W && ps[2] === m.layers[1].b
end

# @id TEST-NN-004 @verifies REQ-NN-004
@testset "TEST-NN-004 bind! leaves" begin
    m = MLP([2, 3, 1], Rng(2))
    t = Tape(); vs = bind!(m, t)
    ps = parameters(m)
    @test length(vs) == length(ps)
    for (v, p) in zip(vs, ps)
        @test v.requires_grad
        @test v.value.data == p.data && v.value.data !== p.data
        @test tape_of(v) === t
    end
    vs[1].value.data[1] += 5.0
    @test parameters(m)[1].data[1] != vs[1].value.data[1]
end

# @id TEST-NN-005 @verifies REQ-NN-005
@testset "TEST-NN-005 mse loss" begin
    t = Tape()
    p = leaf(t, Tensor([1.0, 2.0, 4.0, 0.0], (2, 2)))
    tg = Tensor([0.0, 2.0, 1.0, 1.0], (2, 2))
    l = mse_loss(p, tg)
    @test l.value.shape == ()
    @test l.value.data[1] ≈ (1 + 0 + 9 + 1) / 4
    backward!(t, l)
    @test p.grad.data ≈ 2 .* [1.0, 0.0, 3.0, -1.0] ./ 4
    @test_throws DimensionMismatch mse_loss(p, Tensor([1.0, 2.0], (1, 2)))
end

# @id TEST-NN-006 @verifies REQ-NN-006
@testset "TEST-NN-006 softmax cross entropy" begin
    t = Tape()
    z = leaf(t, Tensor([1.0, 0.0, 0.5, 2.0, 1.0, 0.0], (2, 3)))
    l = softmax_ce(z, [1, 3])
    zz = reshape(z.value.data, 2, 3)
    ref = (log(sum(exp.(zz[1, :]))) - zz[1, 1] + log(sum(exp.(zz[2, :]))) - zz[2, 3]) / 2
    @test l.value.data[1] ≈ ref
    backward!(t, l)
    sm = exp.(zz) ./ sum(exp.(zz); dims=2)
    oh = zeros(2, 3); oh[1, 1] = 1; oh[2, 3] = 1
    @test reshape(z.grad.data, 2, 3) ≈ (sm .- oh) ./ 2
    @test_throws BoundsError softmax_ce(leaf(Tape(), Tensor(zeros(2 * 3), (2, 3))), [1, 4])
    @test_throws BoundsError softmax_ce(leaf(Tape(), Tensor(zeros(2 * 3), (2, 3))), [0, 1])
    @test_throws DimensionMismatch softmax_ce(leaf(Tape(), Tensor(zeros(2 * 3), (2, 3))), [1])
end

# @id TEST-NN-007 @verifies REQ-NN-007
@testset "TEST-NN-007 sgd momentum and weight decay" begin
    p = Tensor([1.0, -2.0], (2,))
    t = Tape(); v = leaf(t, Tensor([1.0, -2.0], (2,)))
    v.grad = Tensor([0.5, 0.5], (2,))
    opt = SGD(0.1; momentum=0.9, weight_decay=0.01)
    sgd_step!(opt, [p], [v])
    g1 = [0.5 + 0.01 * 1.0, 0.5 + 0.01 * -2.0]
    @test p.data ≈ [1.0, -2.0] .- 0.1 .* g1
    p1 = copy(p.data)
    sgd_step!(opt, [p], [v])
    vel2 = 0.9 .* g1 .+ (v.grad.data .+ 0.01 .* p1)
    @test p.data ≈ p1 .- 0.1 .* vel2
    @test_throws DimensionMismatch sgd_step!(opt, [p, p], [v])
    q = Tensor([3.0], (1,)); w = leaf(t, Tensor([3.0], (1,)))
    sgd_step!(SGD(0.5), [q], [w])
    @test q.data == [3.0]
end

# @id TEST-NN-008 @verifies REQ-NN-008
@testset "TEST-NN-008 sgd validation" begin
    @test_throws ArgumentError SGD(0.0)
    @test_throws ArgumentError SGD(-0.1)
    @test_throws ArgumentError SGD(0.1; momentum=1.0)
    @test_throws ArgumentError SGD(0.1; momentum=-0.1)
    @test_throws ArgumentError SGD(0.1; weight_decay=-1.0)
    @test SGD(0.1; momentum=0.0).lr == 0.1
end

# @id TEST-NN-009 @verifies REQ-NN-009
@testset "TEST-NN-009 clip_grad_norm!" begin
    t = Tape()
    a = leaf(t, Tensor([0.0, 0.0], (2,))); b = leaf(t, Tensor([0.0], (1,)))
    a.grad = Tensor([3.0, 0.0], (2,)); b.grad = Tensor([4.0], (1,))
    n = clip_grad_norm!([a, b], 1.0)
    @test n ≈ 5.0
    @test a.grad.data ≈ [0.6, 0.0] && b.grad.data ≈ [0.8]
    n2 = clip_grad_norm!([a, b], 10.0)
    @test n2 ≈ 1.0
    @test a.grad.data ≈ [0.6, 0.0]
    @test clip_grad_norm!([leaf(t, Tensor([1.0], (1,)))], 1.0) == 0.0
    @test_throws ArgumentError clip_grad_norm!([a], 0.0)
end

# @id TEST-NN-010 @verifies REQ-NN-010
@testset "TEST-NN-010 mlp gradcheck" begin
    m = MLP([2, 3, 1], Rng(11))
    x = Tensor([0.5, -0.3, 0.8, 0.1], (2, 2))
    y = Tensor([0.2, -0.4], (2, 1))
    f = (W1, b1, W2, b2) -> begin
        t = tape_of(W1)
        h = tanh_v(add_v(matmul_v(leaf(t, x; requires_grad=false), W1), b1))
        mse_loss(add_v(matmul_v(h, W2), b2), y)
    end
    r = gradcheck(f, [Tensor(copy(p.data), p.shape) for p in parameters(m)])
    @test r.ok
    @test r.max_abs_err < 1e-6
end

# @id TEST-NN-011 @verifies REQ-NN-011
@testset "TEST-NN-011 softmax_ce stable for huge logits" begin
    t = Tape()
    z = leaf(t, Tensor([1000.0, 1000.0, 0.0, 1001.0, -1000.0, 999.0], (2, 3)))
    l = softmax_ce(z, [1, 2])
    @test isfinite(l.value.data[1])
    backward!(t, l)
    @test all(isfinite, z.grad.data)
    z2 = leaf(Tape(), Tensor([0.0, -1.0, -1000.0, 0.0, -2000.0, -2.0], (2, 3)))
    @test l.value.data[1] ≈ softmax_ce(z2, [1, 2]).value.data[1] atol=1e-9
end

end