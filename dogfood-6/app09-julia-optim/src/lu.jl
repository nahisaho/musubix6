module LU
using ..SparseOps
export SingularMatrixError, ConvergenceError, LUFactor, lu_factor, lu_solve, lu_det, solve_checked

struct SingularMatrixError <: Exception
    index::Int
end
struct ConvergenceError <: Exception
    msg::String
    residual::Float64
end
struct LUFactor
    perm::Vector{Int}
    sign::Int
    packed::Matrix{Float64}
end

const PIVOT_TOL = 1e-12

# @id CODE-LU-001 @implements REQ-LU-001 REQ-LU-003 REQ-LU-004
function lu_factor(A::CSR)
    A.n == A.m || throw(DimensionMismatch("lu_factor: matrix must be square, got $(A.n)x$(A.m)"))
    n = A.n
    M = to_dense(A)
    perm = collect(1:n)
    sign = 1
    for k in 1:n
        p = k - 1 + argmax(abs.(M[k:n, k]))
        abs(M[p, k]) < PIVOT_TOL && throw(SingularMatrixError(k))
        if p != k
            M[[k, p], :] = M[[p, k], :]
            perm[[k, p]] = perm[[p, k]]
            sign = -sign
        end
        for i in (k+1):n
            M[i, k] /= M[k, k]
            for j in (k+1):n
                M[i, j] -= M[i, k] * M[k, j]
            end
        end
    end
    LUFactor(perm, sign, M)
end

# @id CODE-LU-002 @implements REQ-LU-002 REQ-LU-005
function lu_solve(F::LUFactor, b::AbstractVector{<:Real})
    n = length(F.perm)
    length(b) == n || throw(DimensionMismatch("lu_solve: expected length $n, got $(length(b))"))
    y = Float64[b[F.perm[i]] for i in 1:n]
    for i in 1:n, j in 1:(i-1)
        y[i] -= F.packed[i, j] * y[j]
    end
    for i in n:-1:1
        for j in (i+1):n
            y[i] -= F.packed[i, j] * y[j]
        end
        y[i] /= F.packed[i, i]
    end
    y
end

# @id CODE-LU-003 @implements REQ-LU-006
lu_det(F::LUFactor) = F.sign * prod(F.packed[i, i] for i in 1:length(F.perm))

# @id CODE-LU-004 @implements REQ-LU-007
function solve_checked(A::CSR, b::AbstractVector{<:Real}; tol::Real = 1e-8)
    x = lu_solve(lu_factor(A), b)
    res = sqrt(sum(abs2, matvec(A, x) .- b))
    res > tol && throw(ConvergenceError("residual $res exceeds tol $tol", res))
    x
end
end
