module NN

using ..Tensors
using ..RngMod
using ..TapeMod
using ..Ops

export Linear, MLP, parameters, bind!, mlp_forward, mse_loss, softmax_ce, SGD, sgd_step!, clip_grad_norm!

const ACTIVATIONS = Dict{Symbol,Function}(:tanh => tanh_v, :relu => relu_v, :sigmoid => sigmoid_v)

function const_var(t, x::Tensor)
    t === nothing && throw(ArgumentError("operand is not attached to a tape"))
    leaf(t, x; requires_grad=false)
end

# @id CODE-NN-001 @implements REQ-NN-001
struct Linear
    W::Tensor
    b::Tensor
    function Linear(nin::Integer, nout::Integer, rng::Rng)
        (nin >= 1 && nout >= 1) || throw(ArgumentError("Linear sizes must be positive, got $nin x $nout"))
        lim = sqrt(6 / (nin + nout))
        W = Tensor([(2 * rand_f64!(rng) - 1) * lim for _ in 1:nin*nout], (nin, nout))
        new(W, Tensor(zeros(nout), (1, nout)))
    end
end

# @id CODE-NN-002 @implements REQ-NN-003
struct MLP
    layers::Vector{Linear}
    activation::Symbol
    function MLP(sizes::AbstractVector{<:Integer}, rng::Rng; activation::Symbol = :tanh)
        length(sizes) >= 2 || throw(ArgumentError("MLP needs at least 2 sizes, got $(length(sizes))"))
        all(s -> s >= 1, sizes) || throw(ArgumentError("MLP sizes must be positive: $sizes"))
        haskey(ACTIVATIONS, activation) || throw(ArgumentError("unknown activation :$activation"))
        new([Linear(sizes[i], sizes[i+1], rng) for i in 1:length(sizes)-1], activation)
    end
end

function parameters(m::MLP)
    ps = Tensor[]
    for l in m.layers
        push!(ps, l.W, l.b)
    end
    ps
end

# @id CODE-NN-003 @implements REQ-NN-004
function bind!(m::MLP, t::Tape)
    [leaf(t, Tensor(copy(p.data), p.shape); requires_grad=true) for p in parameters(m)]
end

# @id CODE-NN-004 @implements REQ-NN-002
function mlp_forward(m::MLP, vars::AbstractVector{Var}, x)
    length(vars) == 2 * length(m.layers) || throw(DimensionMismatch("expected $(2 * length(m.layers)) parameter vars, got $(length(vars))"))
    h = x isa Var ? x : const_var(tape_of(vars[1]), x)
    for (i, l) in enumerate(m.layers)
        h.value.shape[2] == l.W.shape[1] ||
            throw(DimensionMismatch("layer $i expects $(l.W.shape[1]) inputs, got $(h.value.shape[2])"))
        h = add_v(matmul_v(h, vars[2i-1]), vars[2i])
        i < length(m.layers) && (h = ACTIVATIONS[m.activation](h))
    end
    h
end

# @id CODE-NN-005 @implements REQ-NN-005
function mse_loss(pred::Var, target::Tensor)
    pred.value.shape == target.shape ||
        throw(DimensionMismatch("pred $(pred.value.shape) vs target $(target.shape)"))
    d = sub_v(pred, const_var(tape_of(pred), target))
    mean_v(pow_v(d, 2))
end

# @id CODE-NN-006 @implements REQ-NN-006 REQ-NN-011
function softmax_ce(logits::Var, labels::AbstractVector{<:Integer})
    length(logits.value.shape) == 2 || throw(DimensionMismatch("logits must be batch x classes"))
    n, c = logits.value.shape
    length(labels) == n || throw(DimensionMismatch("$(length(labels)) labels for batch of $n"))
    all(l -> 1 <= l <= c, labels) || throw(BoundsError(logits, labels))
    onehot = zeros(n, c)
    for (i, l) in enumerate(labels)
        onehot[i, l] = 1.0
    end
    t = tape_of(logits)
    rowmax = [maximum(logits.value.data[i:n:end]) for i in 1:n]
    shifted = sub_v(logits, const_var(t, Tensor(repeat(rowmax, c), (n, c))))
    lse = log_v(sum_v(exp_v(shifted); dims=2, keepdims=true))
    picked = sum_v(mul_v(shifted, const_var(t, Tensor(vec(onehot), (n, c)))); dims=2, keepdims=true)
    mean_v(sub_v(lse, picked))
end

# @id CODE-NN-007 @implements REQ-NN-007 REQ-NN-008
mutable struct SGD
    lr::Float64
    momentum::Float64
    weight_decay::Float64
    velocity::Vector{Vector{Float64}}
    function SGD(lr::Real; momentum::Real = 0.0, weight_decay::Real = 0.0)
        lr > 0 || throw(ArgumentError("lr must be > 0, got $lr"))
        (0 <= momentum < 1) || throw(ArgumentError("momentum must be in [0,1), got $momentum"))
        weight_decay >= 0 || throw(ArgumentError("weight_decay must be >= 0, got $weight_decay"))
        new(lr, momentum, weight_decay, Vector{Float64}[])
    end
end

function sgd_step!(opt::SGD, params::AbstractVector{Tensor}, vars::AbstractVector{Var})
    length(params) == length(vars) ||
        throw(DimensionMismatch("$(length(params)) params vs $(length(vars)) vars"))
    while length(opt.velocity) < length(params)
        push!(opt.velocity, zeros(numel(params[length(opt.velocity)+1])))
    end
    for (k, (p, v)) in enumerate(zip(params, vars))
        v.grad === nothing && continue
        vel = opt.velocity[k]
        for j in eachindex(p.data)
            vel[j] = opt.momentum * vel[j] + (v.grad.data[j] + opt.weight_decay * p.data[j])
            p.data[j] -= opt.lr * vel[j]
        end
    end
    opt
end

# @id CODE-NN-008 @implements REQ-NN-009
function clip_grad_norm!(vars::AbstractVector{Var}, maxnorm::Real)
    maxnorm > 0 || throw(ArgumentError("maxnorm must be > 0, got $maxnorm"))
    sq = 0.0
    for v in vars
        v.grad === nothing || (sq += sum(abs2, v.grad.data))
    end
    nrm = sqrt(sq)
    if nrm > maxnorm
        s = maxnorm / nrm
        for v in vars
            v.grad === nothing || (v.grad.data .*= s)
        end
    end
    nrm
end

end # module NN
