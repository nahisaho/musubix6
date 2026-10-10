module SparseOps
export CSR, from_triplets, to_dense, nnz, matvec, transpose_csr, add

struct CSR
    n::Int
    m::Int
    rowptr::Vector{Int}
    colind::Vector{Int}
    vals::Vector{Float64}
end

# @id CODE-SPARSE-001 @implements REQ-SPARSE-001 REQ-SPARSE-002 REQ-SPARSE-003
function from_triplets(n::Int, m::Int, I::AbstractVector{<:Integer}, J::AbstractVector{<:Integer}, V::AbstractVector{<:Real})
    length(I) == length(J) == length(V) || throw(DimensionMismatch("triplet lengths differ"))
    rows = [Dict{Int,Float64}() for _ in 1:n]
    for k in eachindex(I)
        (1 <= I[k] <= n) || throw(BoundsError(rows, I[k]))
        (1 <= J[k] <= m) || throw(BoundsError(rows, J[k]))
        rows[I[k]][J[k]] = get(rows[I[k]], J[k], 0.0) + V[k]
    end
    rowptr = Int[1]
    colind = Int[]
    vals = Float64[]
    for r in 1:n
        for c in sort!(collect(keys(rows[r])))
            v = rows[r][c]
            v == 0.0 && continue
            push!(colind, c); push!(vals, v)
        end
        push!(rowptr, length(colind) + 1)
    end
    CSR(n, m, rowptr, colind, vals)
end

# @id CODE-SPARSE-002 @implements REQ-SPARSE-003
nnz(A::CSR) = length(A.vals)

# @id CODE-SPARSE-003 @implements REQ-SPARSE-004 REQ-SPARSE-005
function matvec(A::CSR, x::AbstractVector{<:Real})
    length(x) == A.m || throw(DimensionMismatch("matvec: expected length $(A.m), got $(length(x))"))
    y = zeros(Float64, A.n)
    for r in 1:A.n, k in A.rowptr[r]:(A.rowptr[r+1]-1)
        y[r] += A.vals[k] * x[A.colind[k]]
    end
    y
end

# @id CODE-SPARSE-004 @implements REQ-SPARSE-006
function transpose_csr(A::CSR)
    I = Int[]; J = Int[]; V = Float64[]
    for r in 1:A.n, k in A.rowptr[r]:(A.rowptr[r+1]-1)
        push!(I, A.colind[k]); push!(J, r); push!(V, A.vals[k])
    end
    from_triplets(A.m, A.n, I, J, V)
end

# @id CODE-SPARSE-005 @implements REQ-SPARSE-007
function add(A::CSR, B::CSR)
    (A.n, A.m) == (B.n, B.m) || throw(DimensionMismatch("add: shapes differ"))
    I = Int[]; J = Int[]; V = Float64[]
    for M in (A, B), r in 1:M.n, k in M.rowptr[r]:(M.rowptr[r+1]-1)
        push!(I, r); push!(J, M.colind[k]); push!(V, M.vals[k])
    end
    from_triplets(A.n, A.m, I, J, V)
end

# @id CODE-SPARSE-006 @implements REQ-SPARSE-008
function to_dense(A::CSR)
    D = zeros(Float64, A.n, A.m)
    for r in 1:A.n, k in A.rowptr[r]:(A.rowptr[r+1]-1)
        D[r, A.colind[k]] = A.vals[k]
    end
    D
end
end
