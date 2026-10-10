module Train

using ..Tensors
using ..RngMod
using ..TapeMod
using ..Ops
using ..Data
using ..NN

export TrainConfig, History, train!, accuracy, lr_schedule

Base.@kwdef struct TrainConfig
    seed::Int = 1
    epochs::Int = 10
    lr::Float64 = 0.1
    momentum::Float64 = 0.0
    weight_decay::Float64 = 0.0
    gamma::Float64 = 1.0
    step::Int = 1
    batch::Int = 32
    patience::Int = 0
    min_delta::Float64 = 0.0
    clip::Float64 = 0.0
end

mutable struct History
    losses::Vector{Float64}
    stopped_early::Bool
    stop_epoch::Int
end
History() = History(Float64[], false, 0)

# @id CODE-TRAIN-001 @implements REQ-TRAIN-006
function lr_schedule(cfg::TrainConfig, epoch::Integer)
    epoch >= 1 || throw(ArgumentError("epoch must be >= 1, got $epoch"))
    cfg.step >= 1 || throw(ArgumentError("step must be >= 1, got $(cfg.step)"))
    (0 < cfg.gamma <= 1) || throw(ArgumentError("gamma must be in (0,1], got $(cfg.gamma)"))
    cfg.lr * cfg.gamma^fld(epoch - 1, cfg.step)
end

# @id CODE-TRAIN-002 @implements REQ-TRAIN-004
function accuracy(m::MLP, X::Tensor, y::AbstractVector{<:Integer})
    X.shape[1] == length(y) || throw(DimensionMismatch("$(X.shape[1]) rows vs $(length(y)) labels"))
    t = Tape()
    out = no_grad(t) do
        mlp_forward(m, bind!(m, t), X).value
    end
    n, c = out.shape
    hits = 0
    for i in 1:n
        best = 1
        for j in 2:c
            out.data[(j - 1) * n + i] > out.data[(best - 1) * n + i] && (best = j)
        end
        hits += best == y[i]
    end
    hits / n
end

# @id CODE-TRAIN-003 @implements REQ-TRAIN-001 REQ-TRAIN-002 REQ-TRAIN-005 REQ-TRAIN-007 REQ-TRAIN-008 REQ-TRAIN-009
function train!(m::MLP, X::Tensor, y::AbstractVector{<:Integer}, cfg::TrainConfig)
    cfg.epochs >= 1 || throw(ArgumentError("epochs must be >= 1, got $(cfg.epochs)"))
    X.shape[1] == length(y) || throw(DimensionMismatch("$(X.shape[1]) rows vs $(length(y)) labels"))
    cfg.batch >= 1 || throw(ArgumentError("batch must be >= 1, got $(cfg.batch)"))
    lr_schedule(cfg, 1)
    nclasses = parameters(m)[end].shape[2]
    all(l -> 1 <= l <= nclasses, y) || throw(BoundsError(1:nclasses, extrema(y)))
    n = X.shape[1]
    rng = Rng(cfg.seed)
    opt = SGD(cfg.lr; momentum=cfg.momentum, weight_decay=cfg.weight_decay)
    hist = History()
    best = Inf
    stale = 0
    for epoch in 1:cfg.epochs
        opt.lr = lr_schedule(cfg, epoch)
        total = 0.0
        for (bi, idx) in enumerate(batch_indices(rng, n, cfg.batch))
            t = Tape()
            vars = bind!(m, t)
            loss = softmax_ce(mlp_forward(m, vars, take_rows(X, idx)), y[idx])
            lv = loss.value.data[1]
            isfinite(lv) || error("non-finite loss $lv at epoch $epoch batch $bi")
            backward!(t, loss)
            cfg.clip > 0 && clip_grad_norm!(vars, cfg.clip)
            sgd_step!(opt, parameters(m), vars)
            total += lv * length(idx)
        end
        push!(hist.losses, total / n)
        hist.stop_epoch = epoch
        if cfg.patience > 0
            if hist.losses[end] < best - cfg.min_delta
                best = hist.losses[end]
                stale = 0
            else
                stale += 1
            end
            if stale >= cfg.patience
                hist.stopped_early = true
                break
            end
        end
    end
    hist
end

end # module Train
