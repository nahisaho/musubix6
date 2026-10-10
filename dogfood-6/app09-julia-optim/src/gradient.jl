module Gradient
using ..SparseOps
using ..Results
export quadratic_problem, gradient_descent

# @id CODE-GRAD-001 @implements REQ-GRAD-007
function quadratic_problem(A::CSR, b::AbstractVector{<:Real})
    f = x -> 0.5 * sum(x .* matvec(A, x)) - sum(b .* x)
    g = x -> matvec(A, x) .- b
    f, g
end

function checked(v)
    all(isfinite, v) || throw(DomainError(v, "non-finite value"))
    v
end

# @id CODE-GRAD-002 @implements REQ-GRAD-009 REQ-GRAD-001 REQ-GRAD-002 REQ-GRAD-003 REQ-GRAD-004 REQ-GRAD-005 REQ-GRAD-006 REQ-GRAD-008
function gradient_descent(f, grad, x0::AbstractVector{<:Real}; tol::Real = 1e-8, max_iter::Int = 10_000)
    tol > 0 || throw(ArgumentError("tol must be positive"))
    max_iter >= 1 || throw(ArgumentError("max_iter must be >= 1"))
    x = Float64.(x0)
    fx = checked([f(x)])[1]
    g = checked(grad(x))
    history = [fx]
    for it in 0:max_iter
        gn = sqrt(sum(abs2, g))
        gn < tol && return Result(x, :converged, it, gn, history)
        it == max_iter && return Result(x, :max_iter, it, gn, history)
        t = 1.0
        accepted = false
        for _ in 1:60
            xn = x .- t .* g
            fn = checked([f(xn)])[1]
            if fn <= fx - 1e-4 * t * gn^2 && fn < fx
                x, fx = xn, fn
                accepted = true
                break
            end
            t /= 2
        end
        accepted || return Result(x, :line_search_failed, it, gn, history)
        g = checked(grad(x))
        push!(history, fx)
    end
end
end
