module GradCheck

using ..Tensors
using ..TapeMod

export numeric_grad, gradcheck, GradCheckResult, format_result

struct GradCheckResult
    ok::Bool
    max_abs_err::Float64
    max_rel_err::Float64
    worst::Tuple{Int,Int}
    unused::Vector{Int}
end

check_eps(eps) = eps > 0 || throw(ArgumentError("eps must be > 0, got $eps"))

# @id CODE-GRADCHECK-001 @implements REQ-GRADCHECK-001 REQ-GRADCHECK-002
function numeric_grad(f, t::Tensor; eps::Real=1e-6)
    check_eps(eps)
    work = Tensor(copy(t.data), t.shape)
    g = zeros(numel(t))
    for i in eachindex(g)
        orig = work.data[i]
        work.data[i] = orig + eps
        fp = Float64(f(work))
        work.data[i] = orig - eps
        fm = Float64(f(work))
        work.data[i] = orig
        g[i] = (fp - fm) / (2eps)
    end
    Tensor(g, t.shape)
end

# @id CODE-GRADCHECK-002 @implements REQ-GRADCHECK-003 REQ-GRADCHECK-006 REQ-GRADCHECK-007
function run_scalar(f, tensors::Vector{Tensor})
    tape = Tape()
    vars = [leaf(tape, Tensor(copy(x.data), x.shape)) for x in tensors]
    out = f(vars...)
    out isa Var || throw(ArgumentError("gradcheck: f must return a scalar Var, got $(typeof(out))"))
    numel(out.value) == 1 || throw(ArgumentError("gradcheck: f must return a scalar, got shape $(size_t(out.value))"))
    tape, vars, out
end

function gradcheck(f, inputs; eps::Real=1e-6, rtol::Real=1e-4, atol::Real=1e-6)
    check_eps(eps)
    xs = Tensor[x for x in inputs]
    tape, vars, out = run_scalar(f, xs)
    out.requires_grad && backward!(tape, out)
    unused = Int[]
    max_abs = 0.0; max_rel = 0.0; worst = (1, 1); ok = true
    for (i, v) in enumerate(vars)
        analytic = v.grad === nothing ? (push!(unused, i); zeros(numel(xs[i]))) : v.grad.data
        function value_with(x)
            ys = copy(xs); ys[i] = x
            run_scalar(f, ys)[3].value.data[1]
        end
        num = numeric_grad(value_with, xs[i]; eps=eps).data
        for k in eachindex(num)
            err = abs(analytic[k] - num[k])
            rel = err / max(abs(num[k]), 1e-8)
            err > atol + rtol * abs(num[k]) && (ok = false)
            if err > max_abs
                max_abs = err; worst = (i, k)
            end
            max_rel = max(max_rel, rel)
        end
    end
    GradCheckResult(ok, max_abs, max_rel, worst, unused)
end

# @id CODE-GRADCHECK-003 @implements REQ-GRADCHECK-004 REQ-GRADCHECK-005 REQ-GRADCHECK-008
function format_result(r::GradCheckResult)
    "$(r.ok ? "PASS" : "FAIL") gradcheck: max_abs_err=$(r.max_abs_err) max_rel_err=$(r.max_rel_err) worst=input $(r.worst[1]) element $(r.worst[2])" *
        (isempty(r.unused) ? "" : " unused=$(r.unused)")
end

end # module GradCheck
