module Ops

using ..Tensors
using ..TapeMod

export add_v, sub_v, mul_v, div_v, matmul_v, relu_v, tanh_v, sigmoid_v, exp_v, log_v,
       sum_v, mean_v, pow_v, neg_v

# @id CODE-OPS-001 @implements REQ-OPS-010
# Resolve the owning tape of the operands; detached Vars and Reals become constants.
function owner_tape(vars...)
    t = nothing
    for v in vars
        v isa Var || continue
        if v.tape === nothing
            continue
        end
        tv = tape_of(v)
        tv === nothing && throw(ArgumentError("Var belongs to a stale epoch (tape was reset)"))
        t === nothing || t === tv || throw(ArgumentError("operands belong to different tapes"))
        t = tv
    end
    t
end

# Bring an operand onto tape t: detached Vars and Reals become constant leaves.
function lift(t, x)
    if t === nothing
        return x isa Var ? x : Var(0, Tensor([Float64(x)], ()), nothing, false, Var[], nothing, 0, 0, nothing)
    end
    x isa Var || return leaf(t, Tensor([Float64(x)], ()); requires_grad=false)
    tape_of(x) === t ? x : leaf(t, x.value; requires_grad=false)
end

function finish(t, out::Tensor, parents, backfn)
    t === nothing && return Var(0, out, nothing, false, Var[], nothing, 0, 0, nothing)
    record!(t, out, parents, backfn)
end

# @id CODE-OPS-002 @implements REQ-OPS-001 REQ-OPS-002
function add_v(a, b)
    t = owner_tape(a, b)
    av = lift(t, a); bv = lift(t, b)
    sa, sb = size_t(av.value), size_t(bv.value)
    finish(t, add_t(av.value, bv.value), [av, bv],
        G -> [sum_to_shape(G, sa), sum_to_shape(G, sb)])
end

function sub_v(a, b)
    t = owner_tape(a, b)
    av = lift(t, a); bv = lift(t, b)
    sa, sb = size_t(av.value), size_t(bv.value)
    finish(t, sub_t(av.value, bv.value), [av, bv],
        G -> [sum_to_shape(G, sa), sum_to_shape(map_t(-, G), sb)])
end

function mul_v(a, b)
    t = owner_tape(a, b)
    av = lift(t, a); bv = lift(t, b)
    sa, sb = size_t(av.value), size_t(bv.value)
    finish(t, mul_t(av.value, bv.value), [av, bv],
        G -> [sum_to_shape(mul_t(G, bv.value), sa), sum_to_shape(mul_t(G, av.value), sb)])
end

# @id CODE-OPS-009 @implements REQ-OPS-012
function div_v(a, b)
    t = owner_tape(a, b)
    av = lift(t, a); bv = lift(t, b)
    any(==(0.0), bv.value.data) && throw(DomainError(bv.value.data, "div_v: division by zero"))
    sa, sb = size_t(av.value), size_t(bv.value)
    inv_b = map_t(inv, bv.value)
    finish(t, mul_t(av.value, inv_b), [av, bv],
        G -> [sum_to_shape(mul_t(G, inv_b), sa),
              sum_to_shape(mul_t(G, mul_t(av.value, map_t(v -> -v^2, inv_b))), sb)])
end

# @id CODE-OPS-003 @implements REQ-OPS-003
function matmul_v(a, b)
    t = owner_tape(a, b)
    av = lift(t, a); bv = lift(t, b)
    out = matmul_t(av.value, bv.value)
    finish(t, out, [av, bv],
        G -> [matmul_t(G, transpose_t(bv.value)), matmul_t(transpose_t(av.value), G)])
end

# Shared skeleton for elementwise unary ops: fwd maps the value, dfn gives d out/d in from (x, y).
function unary_op(x, fwd, dfn; check = nothing)
    t = owner_tape(x)
    xv = lift(t, x)
    check === nothing || check(xv.value)
    y = map_t(fwd, xv.value)
    finish(t, y, [xv], G -> [mul_t(G, Tensor([dfn(a, b) for (a, b) in zip(xv.value.data, y.data)], y.shape))])
end

# @id CODE-OPS-004 @implements REQ-OPS-004
relu_v(x) = unary_op(x, v -> v > 0 ? v : 0.0, (a, _) -> a > 0 ? 1.0 : 0.0)

# @id CODE-OPS-005 @implements REQ-OPS-005
tanh_v(x) = unary_op(x, tanh, (_, y) -> 1 - y^2)

sigmoid_v(x) = unary_op(x, v -> v >= 0 ? 1 / (1 + exp(-v)) : exp(v) / (1 + exp(v)), (_, y) -> y * (1 - y))

exp_v(x) = unary_op(x, exp, (_, y) -> y)

# @id CODE-OPS-006 @implements REQ-OPS-006
log_v(x) = unary_op(x, log, (a, _) -> inv(a);
    check = t -> any(<=(0.0), t.data) && throw(DomainError(t.data, "log_v needs x > 0")))

# @id CODE-OPS-007 @implements REQ-OPS-007
function reduce_back(G::Tensor, xshape, dims, keepdims)
    kd = dims === nothing ? ntuple(_ -> 1, length(xshape)) :
         ntuple(k -> k in (dims isa Integer ? (dims,) : dims) ? 1 : xshape[k], length(xshape))
    mul_t(reshape_t(G, kd), Tensor(ones(prod(xshape)), xshape))
end

function sum_v(x; dims=nothing, keepdims::Bool=false)
    t = owner_tape(x)
    xv = lift(t, x)
    out = sum_t(xv.value; dims=dims, keepdims=keepdims)
    xs = size_t(xv.value)
    finish(t, out, [xv], G -> [reduce_back(G, xs, dims, keepdims)])
end

function mean_v(x; dims=nothing, keepdims::Bool=false)
    t = owner_tape(x)
    xv = lift(t, x)
    xs = size_t(xv.value)
    axes = dims === nothing ? collect(1:length(xs)) : collect(dims isa Integer ? (dims,) : dims)
    n = prod(xs[k] for k in axes; init=1)
    s = sum_t(xv.value; dims=dims, keepdims=keepdims)
    finish(t, map_t(v -> v / n, s), [xv], G -> [map_t(v -> v / n, reduce_back(G, xs, dims, keepdims))])
end

# @id CODE-OPS-008 @implements REQ-OPS-008
function pow_v(x, p::Integer)
    t = owner_tape(x)
    xv = lift(t, x)
    finish(t, map_t(v -> float(v)^p, xv.value), [xv],
        G -> [mul_t(G, map_t(v -> p == 0 ? 0.0 : p * float(v)^(p - 1), xv.value))])
end

neg_v(x) = mul_v(x, -1.0)

# @id CODE-OPS-011 @implements REQ-OPS-011
Base.:+(a::Var, b::Union{Var,Real}) = add_v(a, b)
Base.:+(a::Real, b::Var) = add_v(a, b)
Base.:-(a::Var, b::Union{Var,Real}) = sub_v(a, b)
Base.:-(a::Real, b::Var) = sub_v(a, b)
Base.:-(a::Var) = neg_v(a)
Base.:/(a::Var, b::Union{Var,Real}) = div_v(a, b)
Base.:/(a::Real, b::Var) = div_v(a, b)
Base.:*(a::Real, b::Var) = mul_v(a, b)
Base.:*(a::Var, b::Real) = mul_v(a, b)
function Base.:*(a::Var, b::Var)
    length(size_t(a.value)) == 2 && length(size_t(b.value)) == 2 ? matmul_v(a, b) : mul_v(a, b)
end

end # module Ops
