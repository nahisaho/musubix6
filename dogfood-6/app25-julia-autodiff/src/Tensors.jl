module Tensors

export Tensor, numel, size_t, strides_t, reshape_t, transpose_t, broadcast_shape,
       add_t, sub_t, mul_t, matmul_t, sum_t, sum_to_shape, map_t

# @id CODE-TENSOR-001 @implements REQ-TENSOR-001 REQ-TENSOR-002
struct Tensor
    data::Vector{Float64}
    shape::Tuple
    function Tensor(data::AbstractVector{<:Real}, shape::Tuple)
        all(d -> d >= 1, shape) || throw(ArgumentError("dims must be >= 1, got $shape"))
        prod(shape) == length(data) ||
            throw(DimensionMismatch("shape $shape needs $(prod(shape)) elements, got $(length(data))"))
        new(Float64.(collect(data)), shape)
    end
end

numel(t::Tensor) = length(t.data)
size_t(t::Tensor) = t.shape

# @id CODE-TENSOR-002 @implements REQ-TENSOR-003
function strides_t(shape::Tuple)
    st = Int[]
    acc = 1
    for d in shape
        push!(st, acc)
        acc *= d
    end
    Tuple(st)
end

# @id CODE-TENSOR-003 @implements REQ-TENSOR-004
function Base.getindex(t::Tensor, idx::Int...)
    length(idx) == length(t.shape) || throw(BoundsError(t, idx))
    off = 1
    for (k, (i, d, s)) in enumerate(zip(idx, t.shape, strides_t(t.shape)))
        1 <= i <= d || throw(BoundsError(t, idx))
        off += (i - 1) * s
    end
    t.data[off]
end

# @id CODE-TENSOR-004 @implements REQ-TENSOR-005
function reshape_t(t::Tensor, shape::Tuple)
    count(==(-1), shape) <= 1 || throw(ArgumentError("at most one -1 allowed"))
    known = prod(d for d in shape if d != -1; init=1)
    if -1 in shape
        known > 0 && numel(t) % known == 0 ||
            throw(DimensionMismatch("cannot infer -1 for $(numel(t)) elements in $shape"))
        shape = map(d -> d == -1 ? numel(t) ÷ known : d, shape)
    end
    Tensor(copy(t.data), Tuple(shape))
end

# @id CODE-TENSOR-005 @implements REQ-TENSOR-006
function transpose_t(t::Tensor)
    length(t.shape) == 2 || throw(ArgumentError("transpose_t needs a 2-D tensor"))
    r, c = t.shape
    out = Vector{Float64}(undef, r * c)
    for j in 1:c, i in 1:r
        out[(i - 1) * c + j] = t.data[(j - 1) * r + i]
    end
    Tensor(out, (c, r))
end

# @id CODE-TENSOR-006 @implements REQ-TENSOR-007
function broadcast_shape(a::Tuple, b::Tuple)
    n = max(length(a), length(b))
    out = Int[]
    for k in 1:n
        da = k <= length(a) ? a[end-k+1] : 1
        db = k <= length(b) ? b[end-k+1] : 1
        (da == db || da == 1 || db == 1) ||
            throw(DimensionMismatch("cannot broadcast $a with $b"))
        push!(out, da == 1 ? db : da)
    end
    Tuple(reverse(out))
end

# Zero-based coordinate of linear (zero-based, column-major) position `lin` along axis k.
coord(lin::Int, shape::Tuple, st::Tuple, k::Int) = (lin ÷ st[k]) % shape[k]

# Maps a linear column-major position of the broadcast result to the source offset.
function bcast_offsets(src::Tuple, out::Tuple)
    n = prod(out)
    offs = Vector{Int}(undef, n)
    pad = (ntuple(_ -> 1, length(out) - length(src))..., src...)
    sst = strides_t(pad)
    ost = strides_t(out)
    for lin in 0:n-1
        off = 0
        for k in eachindex(out)
            pad[k] != 1 && (off += coord(lin, out, ost, k) * sst[k])
        end
        offs[lin+1] = off + 1
    end
    offs
end

# @id CODE-TENSOR-007 @implements REQ-TENSOR-008
function bcast_apply(f, a::Tensor, b::Tensor)
    shape = broadcast_shape(a.shape, b.shape)
    oa = bcast_offsets(a.shape, shape)
    ob = bcast_offsets(b.shape, shape)
    Tensor([f(a.data[oa[i]], b.data[ob[i]]) for i in eachindex(oa)], shape)
end
add_t(a::Tensor, b::Tensor) = bcast_apply(+, a, b)
sub_t(a::Tensor, b::Tensor) = bcast_apply(-, a, b)
mul_t(a::Tensor, b::Tensor) = bcast_apply(*, a, b)

# @id CODE-TENSOR-008 @implements REQ-TENSOR-009
function matmul_t(a::Tensor, b::Tensor)
    (length(a.shape) == 2 && length(b.shape) == 2 && a.shape[2] == b.shape[1]) ||
        throw(DimensionMismatch("matmul $(a.shape) x $(b.shape)"))
    m, k = a.shape
    n = b.shape[2]
    out = zeros(m * n)
    for j in 1:n, p in 1:k
        bv = b.data[(j - 1) * k + p]
        for i in 1:m
            out[(j - 1) * m + i] += a.data[(p - 1) * m + i] * bv
        end
    end
    Tensor(out, (m, n))
end

# @id CODE-TENSOR-009 @implements REQ-TENSOR-010
function sum_t(t::Tensor; dims=nothing, keepdims::Bool=false)
    nd = length(t.shape)
    axes = dims === nothing ? collect(1:nd) : collect(dims isa Integer ? (dims,) : dims)
    all(1 .<= axes .<= nd) || throw(ArgumentError("dims $dims out of range for $nd-D tensor"))
    outkeep = ntuple(k -> k in axes ? 1 : t.shape[k], nd)
    ost = strides_t(outkeep)
    tst = strides_t(t.shape)
    out = zeros(prod(outkeep))
    for lin in 0:numel(t)-1
        off = 0
        for k in 1:nd
            k in axes || (off += coord(lin, t.shape, tst, k) * ost[k])
        end
        out[off+1] += t.data[lin+1]
    end
    shape = keepdims ? outkeep : Tuple(t.shape[k] for k in 1:nd if !(k in axes))
    Tensor(out, shape)
end

# @id CODE-TENSOR-010 @implements REQ-TENSOR-011
function sum_to_shape(t::Tensor, shape::Tuple)
    t.shape == shape && return Tensor(copy(t.data), shape)
    broadcast_shape(shape, t.shape) == t.shape ||
        throw(DimensionMismatch("cannot reduce $(t.shape) to $shape"))
    lead = length(t.shape) - length(shape)
    padded = (ntuple(_ -> 1, lead)..., shape...)
    axes = [k for k in eachindex(padded) if padded[k] == 1 && t.shape[k] != 1]
    r = isempty(axes) ? t : sum_t(t; dims=Tuple(axes), keepdims=true)
    Tensor(copy(r.data), shape)
end

# @id CODE-TENSOR-011 @implements REQ-TENSOR-012
map_t(f, t::Tensor) = Tensor([f(x) for x in t.data], t.shape)

end # module Tensors
