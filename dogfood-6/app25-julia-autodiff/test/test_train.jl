using Test
include("../src/Tensors.jl")
include("../src/Rng.jl")
include("../src/Tape.jl")
include("../src/Ops.jl")
include("../src/Data.jl")
include("../src/NN.jl")
include("../src/Train.jl")
using .Tensors
using .RngMod
using .TapeMod
using .Ops
using .Data
using .NN
using .Train

snapshot(m) = [copy(p.data) for p in parameters(m)]

@testset "train" begin

# @id TEST-TRAIN-001 @verifies REQ-TRAIN-001
@testset "TEST-TRAIN-001 epoch loss is batch-size weighted" begin
    X, y = make_xor(Rng(1), 7)
    cfg = TrainConfig(seed=5, epochs=1, lr=0.2, batch=3)
    m = MLP([2, 3, 2], Rng(2)); ref = deepcopy(m)
    h = train!(m, X, y, cfg)
    @test length(h.losses) == 1
    # replay by hand: batches of 3,3,1 from Rng(5)
    rng = Rng(5); opt = SGD(0.2); tot = 0.0
    for idx in batch_indices(rng, 7, 3)
        t = Tape(); vs = bind!(ref, t)
        l = softmax_ce(mlp_forward(ref, vs, take_rows(X, idx)), y[idx])
        tot += l.value.data[1] * length(idx)
        backward!(t, l)
        sgd_step!(opt, parameters(ref), vs)
    end
    @test h.losses[1] ≈ tot / 7
    @test snapshot(m) ≈ snapshot(ref)
    # clipping bounds the total movement
    m2 = MLP([2, 3, 2], Rng(2)); before = snapshot(m2)
    train!(m2, X, y, TrainConfig(seed=5, epochs=1, lr=0.2, batch=3, clip=0.01))
    move = sqrt(sum(sum(abs2, a .- b) for (a, b) in zip(snapshot(m2), before)))
    @test 0 < move <= 0.2 * 0.01 * 3 + 1e-12
end

# @id TEST-TRAIN-002 @verifies REQ-TRAIN-002
@testset "TEST-TRAIN-002 determinism" begin
    X, y = make_xor(Rng(3), 40)
    base = MLP([2, 4, 2], Rng(8))
    a = deepcopy(base); b = deepcopy(base); c = deepcopy(base)
    cfg = TrainConfig(seed=11, epochs=5, lr=0.1, batch=8)
    ha = train!(a, X, y, cfg); hb = train!(b, X, y, cfg)
    @test ha.losses == hb.losses
    @test snapshot(a) == snapshot(b)
    hc = train!(c, X, y, TrainConfig(seed=12, epochs=5, lr=0.1, batch=8))
    @test hc.losses != ha.losses
end

# @id TEST-TRAIN-003 @verifies REQ-TRAIN-003
@testset "TEST-TRAIN-003 learns xor" begin
    X, y = make_xor(Rng(1), 200)
    m = MLP([2, 8, 2], Rng(2))
    h = train!(m, X, y, TrainConfig(seed=7, epochs=60, lr=0.3, batch=20))
    @test accuracy(m, X, y) >= 0.95
    @test h.losses[end] < h.losses[1]
    @test length(h.losses) == 60 && !h.stopped_early
end

# @id TEST-TRAIN-004 @verifies REQ-TRAIN-004
@testset "TEST-TRAIN-004 accuracy with ties" begin
    m = MLP([2, 2], Rng(1))
    parameters(m)[1].data .= [1.0, 0.0, 0.0, 1.0]
    parameters(m)[2].data .= 0.0
    X = Tensor([2.0, 0.0, 1.0, 5.0, 3.0, 0.0, 1.0, 4.0], (4, 2))   # rows (2,3) (0,0) (1,1) (5,4)
    @test accuracy(m, X, [2, 1, 1, 1]) == 1.0
    @test accuracy(m, X, [1, 2, 2, 2]) == 0.0
    @test accuracy(m, X, [2, 2, 2, 1]) == 0.5
    @test_throws DimensionMismatch accuracy(m, X, [1, 2])
end

# @id TEST-TRAIN-005 @verifies REQ-TRAIN-005
@testset "TEST-TRAIN-005 early stopping" begin
    X, y = make_xor(Rng(3), 20)
    m = MLP([2, 3, 2], Rng(1))
    h = train!(m, X, y, TrainConfig(seed=1, epochs=50, lr=1e-9, batch=10, patience=2, min_delta=1.0))
    @test h.stopped_early
    @test h.stop_epoch == 3
    @test length(h.losses) == 3
    m2 = MLP([2, 3, 2], Rng(1))
    h2 = train!(m2, X, y, TrainConfig(seed=1, epochs=4, lr=1e-9, batch=10, patience=0))
    @test !h2.stopped_early && h2.stop_epoch == 4 && length(h2.losses) == 4
    m3 = MLP([2, 3, 2], Rng(1))
    h3 = train!(m3, X, y, TrainConfig(seed=1, epochs=4, lr=1e-9, batch=10, patience=10, min_delta=0.0))
    @test !h3.stopped_early && h3.stop_epoch == 4
end

# @id TEST-TRAIN-006 @verifies REQ-TRAIN-006
@testset "TEST-TRAIN-006 lr schedule" begin
    cfg = TrainConfig(lr=0.8, gamma=0.5, step=3)
    @test [lr_schedule(cfg, e) for e in 1:7] ≈ [0.8, 0.8, 0.8, 0.4, 0.4, 0.4, 0.2]
    @test lr_schedule(TrainConfig(lr=0.3), 99) == 0.3
    @test_throws ArgumentError lr_schedule(cfg, 0)
    @test_throws ArgumentError lr_schedule(TrainConfig(step=0), 1)
    @test_throws ArgumentError lr_schedule(TrainConfig(gamma=1.5), 1)
    @test_throws ArgumentError lr_schedule(TrainConfig(gamma=0.0), 1)
end

# @id TEST-TRAIN-007 @verifies REQ-TRAIN-007
@testset "TEST-TRAIN-007 non-finite loss aborts" begin
    X, y = make_xor(Rng(3), 6)
    X.data[1] = NaN
    m = MLP([2, 3, 2], Rng(1)); before = snapshot(m)
    err = try; train!(m, X, y, TrainConfig(seed=1, epochs=2, lr=0.1, batch=6)); nothing; catch e; e; end
    @test err isa ErrorException
    @test occursin("epoch 1", err.msg) && occursin("batch 1", err.msg)
    @test snapshot(m) == before
end

# @id TEST-TRAIN-008 @verifies REQ-TRAIN-008
@testset "TEST-TRAIN-008 argument validation" begin
    X, y = make_xor(Rng(3), 6)
    m = MLP([2, 3, 2], Rng(1)); before = snapshot(m)
    @test_throws ArgumentError train!(m, X, y, TrainConfig(epochs=0))
    @test_throws DimensionMismatch train!(m, X, y[1:5], TrainConfig(epochs=2))
    @test_throws ArgumentError train!(m, X, y, TrainConfig(epochs=2, batch=0))
    @test snapshot(m) == before
end

# @id TEST-TRAIN-009 @verifies REQ-TRAIN-009
@testset "TEST-TRAIN-009 out-of-range label rejected before any update" begin
    X, y = make_xor(Rng(3), 8)
    y[8] = 3
    m = MLP([2, 3, 2], Rng(1)); before = snapshot(m)
    @test_throws BoundsError train!(m, X, y, TrainConfig(seed=1, epochs=2, lr=0.1, batch=2))
    @test snapshot(m) == before
    y[8] = 0
    @test_throws BoundsError train!(m, X, y, TrainConfig(seed=1, epochs=2, lr=0.1, batch=2))
    @test snapshot(m) == before
end

end
