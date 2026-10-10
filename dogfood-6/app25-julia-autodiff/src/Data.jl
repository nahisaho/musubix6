module Data

using ..Tensors
using ..RngMod

export make_xor, make_spirals, batch_indices, take_rows, train_test_split

# @id CODE-DATA-001 @implements REQ-DATA-001 REQ-DATA-003
function make_xor(rng::Rng, n::Integer)
    n >= 1 || throw(ArgumentError("make_xor needs n >= 1, got $n"))
    X = zeros(n, 2)
    y = Vector{Int}(undef, n)
    for i in 1:n
        for j in 1:2
            mag = 0.2 + 0.8 * rand_f64!(rng)
            X[i, j] = rand_f64!(rng) < 0.5 ? -mag : mag
        end
        y[i] = 1 + (X[i, 1] * X[i, 2] < 0 ? 1 : 0)
    end
    Tensor(vec(X), (n, 2)), y
end

# @id CODE-DATA-002 @implements REQ-DATA-002 REQ-DATA-003
function make_spirals(rng::Rng, n::Integer, k::Integer; noise::Real = 0.1)
    n >= 1 || throw(ArgumentError("make_spirals needs n >= 1, got $n"))
    k >= 2 || throw(ArgumentError("make_spirals needs k >= 2, got $k"))
    X = zeros(n * k, 2)
    y = Vector{Int}(undef, n * k)
    row = 0
    for c in 1:k, i in 1:n
        t = n == 1 ? 1.0 : (i - 1) / (n - 1)
        r = 0.05 + 0.95 * t
        a = 2π * (c - 1) / k + 4.0 * t + noise * randn!(rng)
        row += 1
        X[row, 1] = r * cos(a)
        X[row, 2] = r * sin(a)
        y[row] = c
    end
    Tensor(vec(X), (n * k, 2)), y
end

# @id CODE-DATA-003 @implements REQ-DATA-004 REQ-DATA-005
function batch_indices(rng::Rng, n::Integer, bs::Integer)
    (n >= 1 && bs >= 1) || throw(ArgumentError("batch_indices needs n >= 1 and bs >= 1, got n=$n bs=$bs"))
    perm = shuffle!(rng, collect(1:n))
    [perm[s:min(s + bs - 1, n)] for s in 1:bs:n]
end

# @id CODE-DATA-004 @implements REQ-DATA-006
function take_rows(X::Tensor, idx::AbstractVector{<:Integer})
    length(X.shape) == 2 || throw(ArgumentError("take_rows needs a 2-D tensor"))
    r, c = X.shape
    all(i -> 1 <= i <= r, idx) || throw(BoundsError(X, idx))
    out = Vector{Float64}(undef, length(idx) * c)
    for j in 1:c, (k, i) in enumerate(idx)
        out[(j - 1) * length(idx) + k] = X.data[(j - 1) * r + i]
    end
    Tensor(out, (length(idx), c))
end

# @id CODE-DATA-005 @implements REQ-DATA-007
function train_test_split(rng::Rng, n::Integer, frac::Real)
    0 < frac < 1 || throw(ArgumentError("frac must be in (0,1), got $frac"))
    perm = shuffle!(rng, collect(1:n))
    nt = round(Int, frac * n)
    perm[nt+1:end], perm[1:nt]
end

end # module Data
