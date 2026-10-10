module Newton
using ..SparseOps
using ..LU
using ..Results
export newton

function residual_norm(F, x)
    r = F(x)
    all(isfinite, r) || throw(DomainError(x, "F returned a non-finite value"))
    r, sqrt(sum(abs2, r))
end

# @id CODE-NEWTON-001 @implements REQ-NEWTON-001 REQ-NEWTON-002 REQ-NEWTON-003 REQ-NEWTON-004 REQ-NEWTON-005 REQ-NEWTON-006 REQ-NEWTON-007 REQ-NEWTON-008
function newton(F, J, x0::AbstractVector{<:Real}; tol::Real = 1e-8, max_iter::Int = 50)
    tol > 0 || throw(ArgumentError("tol must be positive"))
    max_iter >= 1 || throw(ArgumentError("max_iter must be >= 1"))
    x = Float64.(x0)
    r, nr = residual_norm(F, x)
    history = [nr]
    for it in 0:max_iter
        nr < tol && return Result(x, :converged, it, nr, history)
        it == max_iter && break
        F0 = try
            lu_factor(J(x))
        catch e
            e isa SingularMatrixError || rethrow()
            return Result(x, :singular, it, nr, history)
        end
        d = lu_solve(F0, -r)
        t = 1.0
        accepted = false
        for _ in 1:30
            xn = x .+ t .* d
            rn, nn = residual_norm(F, xn)
            if nn < nr
                x, r, nr = xn, rn, nn
                accepted = true
                break
            end
            t /= 2
        end
        accepted || return Result(x, :stalled, it, nr, history)
        push!(history, nr)
    end
    Result(x, :max_iter, max_iter, nr, history)
end
end
