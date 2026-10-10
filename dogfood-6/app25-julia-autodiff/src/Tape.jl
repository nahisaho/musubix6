module TapeMod

using ..Tensors
import Base: detach

export Tape, Var, leaf, record!, backward!, zero_grad!, no_grad, detach, reset!, tape_of

mutable struct Var
    id::Int
    value::Tensor
    grad::Union{Nothing,Tensor}
    requires_grad::Bool
    parents::Vector{Var}
    backfn::Union{Nothing,Function}
    tape_id::Int
    epoch::Int
    tape::Any
end

mutable struct Tape
    nodes::Vector{Var}
    epoch::Int
    grad_enabled::Bool
    freed::Bool
    uid::Int
end
const TAPE_COUNTER = Ref(0)
Tape() = Tape(Var[], 1, true, false, (TAPE_COUNTER[] += 1))

# @id CODE-TAPE-001 @implements REQ-TAPE-001 REQ-TAPE-010 REQ-TAPE-011
function leaf(t::Tape, v::Tensor; requires_grad::Bool=true)
    t.freed && throw(ErrorException("tape was freed by backward!; call reset!(tape)"))
    n = Var(length(t.nodes) + 1, v, nothing, requires_grad, Var[], nothing, t.uid, t.epoch, t)
    push!(t.nodes, n)
    n
end

detach(v::Var) = Var(0, Tensor(copy(v.value.data), v.value.shape), nothing, false, Var[], nothing, 0, 0, nothing)

function reset!(t::Tape)
    empty!(t.nodes)
    t.epoch += 1
    t.freed = false
    t
end

# @id CODE-TAPE-002 @implements REQ-TAPE-002 REQ-TAPE-003 REQ-TAPE-009
function record!(t::Tape, v::Tensor, parents, backfn)
    t.freed && throw(ErrorException("tape was freed by backward!; call reset!(tape)"))
    for p in parents
        (p.tape_id == t.uid && p.epoch == t.epoch) ||
            throw(ArgumentError("parent Var $(p.id) belongs to another tape or an older epoch"))
    end
    req = any(p -> p.requires_grad, parents)
    if !t.grad_enabled || !req
        return Var(0, v, nothing, false, Var[], nothing, 0, 0, nothing)
    end
    n = Var(length(t.nodes) + 1, v, nothing, true, collect(Var, parents), backfn, t.uid, t.epoch, t)
    push!(t.nodes, n)
    n
end

function no_grad(f, t::Tape)
    prev = t.grad_enabled
    t.grad_enabled = false
    try
        return f()
    finally
        t.grad_enabled = prev
    end
end

# @id CODE-TAPE-003 @implements REQ-TAPE-004 REQ-TAPE-005 REQ-TAPE-006 REQ-TAPE-007 REQ-TAPE-012
function backward!(t::Tape, loss::Var; retain::Bool=false)
    t.freed && throw(ErrorException("graph already freed; use retain=true or reset!(tape)"))
    (loss.tape_id == t.uid && loss.epoch == t.epoch) || throw(ArgumentError("loss is not on this tape"))
    numel(loss.value) == 1 || throw(ArgumentError("backward! needs a scalar loss, got shape $(size_t(loss.value))"))
    loss.requires_grad || throw(ErrorException("loss does not require grad"))
    for n in t.nodes
        isempty(n.parents) || (n.grad = nothing)
    end
    loss.grad = Tensor(ones(1), size_t(loss.value))
    for id in loss.id:-1:1
        n = t.nodes[id]
        (n.grad === nothing || n.backfn === nothing) && continue
        gs = n.backfn(n.grad)
        length(gs) == length(n.parents) ||
            throw(DimensionMismatch("backfn of node $id returned $(length(gs)) grads for $(length(n.parents)) parents"))
        for (p, g) in zip(n.parents, gs)
            size_t(g) == size_t(p.value) ||
                throw(DimensionMismatch("grad shape $(size_t(g)) != parent shape $(size_t(p.value)) at node $id"))
            p.requires_grad || continue
            p.grad = p.grad === nothing ? Tensor(copy(g.data), g.shape) : add_t(p.grad, g)
        end
    end
    if !retain
        for n in t.nodes
            n.backfn = nothing
        end
        t.freed = true
    end
    nothing
end

# @id CODE-TAPE-004 @implements REQ-TAPE-008
function zero_grad!(t::Tape)
    for n in t.nodes
        n.grad = nothing
    end
    t
end

# @id CODE-TAPE-005 @implements REQ-TAPE-013
function tape_of(v::Var)
    t = v.tape
    (t !== nothing && t.uid == v.tape_id && t.epoch == v.epoch) ? t : nothing
end

end # module TapeMod
